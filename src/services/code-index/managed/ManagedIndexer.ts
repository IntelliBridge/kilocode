// kilocode_change new file
/**
 * When extension activates, we need to instantiate the ManagedIndexer and then
 * fetch the api configuration deets and then fetch the organization to see
 * if the feature is enabled for the organization. If it is, then we will
 * instantiate a git-watcher for every folder in the workspace. We will also
 * want to initiate a scan of every folder in the workspace. git-watcher's
 * responsibility is to to alert the ManagedIndexer on branch/commit changes
 * for a given workspace folder. The ManagedIndexer can then run a new scan
 * for that workspace folder. If there is an on-going scan for that particular
 * workspace folder, then we will cancel the on-going scan and start a new one.
 *
 * Scans should be cancellable. The ManagedIndexer should track ongoing scans
 * so that they can be cancelled when the ManagedIndexer is disposed or if the
 * workspace folder is removed, or if the git-watcher detects a change.
 *
 * Git Watchers too can be disposed in the case of the ManagedIndexer being
 * disposed or the workspace folder being removed.
 *
 * Questions:
 *   - How do we communicate state to the webview?
 *   - Should we pass in an instance of ClineProvider or should we pass
 *     ManagedIndexer into ClineProvider?
 *   - How do we populate prompts and provide the tool definitions?
 *   - How do we translate a codebase_search tool call to ManagedIndexer?
 *   - If we're supporting multiple workspace folders, how do we represent
 *     that in the webview UI?
 *
 *
 * The current git watcher implementation is too tied to the managed indexing
 * concept and should be abstracted to be a regular ol' dispoable object that
 * can be instantiated based on a cwd.
 *
 * The scanner implementation should be updated to be able to introspect
 *
 * State for each workspace folder:
 *   - git branch
 *   - projectId
 *   - manifest
 *   - is indexing
 *
 * Things we want in the UI:
 *
 * - For each project ID
 * - Indexing status (currently )
 *
 * -----------------------------------------------------------------------------
 *
 * We can think of ManagedIndexer as a few components:
 *
 * 1. Inputs - Workspace Folders and Profile/Organization
 * 2. Derived values - Project Config and Organization/Profile (is feature enabled)
 * 3. Git Watchers
 */

import * as vscode from "vscode"
import * as path from "path"
import { promises as fs } from "fs"
import pLimit from "p-limit"
import type { ClineProvider } from "../../../core/webview/ClineProvider"
import { KiloOrganization } from "../../../shared/kilocode/organization"
import { OrganizationService } from "../../kilocode/OrganizationService"
import { GitWatcher, GitWatcherFileEvent } from "../../../shared/GitWatcher"
import { getCurrentBranch, isGitRepository } from "./git-utils"
import { getKilocodeConfig } from "../../../utils/kilo-config-file"
import { getGitRepositoryInfo } from "../../../utils/git"
import { getServerManifest, upsertFile } from "./api-client"
import { logger } from "../../../utils/logging"
import { MANAGED_MAX_CONCURRENT_FILES } from "../constants"
import { ServerManifest } from "./types"

interface ManagedIndexerConfig {
	kilocodeToken: string | null
	kilocodeOrganizationId: string | null
	kilocodeTesterWarningsDisabledUntil: number | null
}

interface ManagedIndexerWorkspaceFolderState {
	gitBranch: string
	projectId: string
	manifest: ServerManifest
	isIndexing: boolean
	watcher: GitWatcher
}

export class ManagedIndexer implements vscode.Disposable {
	// Handle changes to vscode workspace folder changes
	workspaceFoldersListener: vscode.Disposable | null = null
	watchers: GitWatcher[] = []
	config: ManagedIndexerConfig | null = null
	organization: KiloOrganization | null = null
	isActive = false
	workspaceFolderState: Map<string, ManagedIndexerWorkspaceFolderState> = new Map()

	// Concurrency limiter for file upserts
	private readonly fileUpsertLimit = pLimit(MANAGED_MAX_CONCURRENT_FILES)

	constructor(
		/**
		 * We need to pass through the main ClineProvider for access to global state
		 * and to react to changes in organizations/profiles
		 */
		public provider: ClineProvider,
	) {}

	// TODO: The fetchConfig, fetchOrganization, and isEnabled functions are sort of spaghetti
	// code right now. We need to clean this up to be more stateless or better rely
	// on proper memoization/invalidation techniques

	async fetchConfig(): Promise<ManagedIndexerConfig> {
		const {
			apiConfiguration: {
				kilocodeOrganizationId = null,
				kilocodeToken = null,
				kilocodeTesterWarningsDisabledUntil = null,
			},
		} = await this.provider.getState()

		this.config = { kilocodeOrganizationId, kilocodeToken, kilocodeTesterWarningsDisabledUntil }

		return this.config
	}

	async fetchOrganization(): Promise<KiloOrganization | null> {
		const config = await this.fetchConfig()

		if (config.kilocodeToken && config.kilocodeOrganizationId) {
			this.organization = await OrganizationService.fetchOrganization(
				config.kilocodeToken,
				config.kilocodeOrganizationId,
				config.kilocodeTesterWarningsDisabledUntil ?? undefined,
			)

			return this.organization
		}

		this.organization = null

		return this.organization
	}

	async isEnabled(): Promise<boolean> {
		const organization = await this.fetchOrganization()

		if (!organization) {
			console.log("[ManagedIndexer] No organization found, skipping managed indexing")
			return false
		}

		if (!OrganizationService.isCodeIndexingEnabled(organization)) {
			return false
		}

		return true
	}

	async start() {
		vscode.workspace.onDidChangeWorkspaceFolders(this.onDidChangeWorkspaceFolders)

		if (!vscode.workspace.workspaceFolders?.length) {
			console.log("[ManagedIndexer] No workspace folders found, skipping managed indexing")
			return
		}

		if (!(await this.isEnabled())) {
			console.log("[ManagedIndexer] Managed indexing is not enabled")
			return
		}

		// TODO: Plumb kilocodeTesterWarningsDisabledUntil through
		const { kilocodeOrganizationId, kilocodeToken } = this.config ?? {}

		if (!kilocodeOrganizationId || !kilocodeToken) {
			console.log("[ManagedIndexer] No organization ID or token found, skipping managed indexing")
			return
		}

		this.isActive = true
		this.watchers = await Promise.all(
			vscode.workspace.workspaceFolders.map(async (folder) => {
				const cwd = folder.uri.fsPath

				if (!(await isGitRepository(cwd))) {
					return null
				}

				const [{ repositoryUrl }, branch] = await Promise.all([
					getGitRepositoryInfo(cwd),
					getCurrentBranch(cwd),
				])
				const config = await getKilocodeConfig(cwd, repositoryUrl)
				const watcher = new GitWatcher({ cwd })
				const projectId = config?.project?.id

				if (!projectId) {
					console.log("[ManagedIndexer] No project ID found for workspace folder", cwd)
					return null
				}
				const manifest = await getServerManifest(kilocodeOrganizationId, projectId, branch, kilocodeToken)

				watcher.onFile((event) => this.onFile(Object.assign(event, { projectId, manifest, config })))

				// Perform an initial scan
				await watcher.scan()
				// Then start the watcher
				await watcher.start()

				return watcher
			}),
		).then((watchers) => watchers.filter((w) => !!w))
	}

	dispose() {
		this.workspaceFoldersListener?.dispose()
		this.workspaceFoldersListener = null
		this.watchers.forEach((watcher) => watcher.dispose())
		this.watchers = []
		this.isActive = false
	}

	async onFile({
		branch,
		filePath,
		fileHash,
		isBaseBranch,
		projectId,
		manifest,
		watcher,
	}: GitWatcherFileEvent & { projectId: string; manifest: ServerManifest }) {
		if (!this.isActive) {
			return
		}

		// Already indexed
		if (manifest.files.some((f) => f.filePath === filePath && f.fileHash === f.fileHash)) {
			return
		}

		// Concurrently process the file
		return this.fileUpsertLimit(async () => {
			try {
				// Ensure we have the necessary configuration
				if (!this.config?.kilocodeToken || !this.config?.kilocodeOrganizationId) {
					logger.warn("[ManagedIndexer] Missing token or organization ID, skipping file upsert")
					return
				}

				const absoluteFilePath = path.isAbsolute(filePath) ? filePath : path.join(watcher.config.cwd, filePath)
				const fileBuffer = await fs.readFile(absoluteFilePath)
				const relativeFilePath = path.relative(watcher.config.cwd, absoluteFilePath)

				// Call the upsertFile API
				await upsertFile({
					fileBuffer,
					fileHash,
					filePath: relativeFilePath,
					gitBranch: branch,
					isBaseBranch,
					organizationId: this.config.kilocodeOrganizationId,
					projectId,
					kilocodeToken: this.config.kilocodeToken,
				})

				logger.info(`[ManagedIndexer] Successfully upserted file: ${relativeFilePath} (branch: ${branch})`)
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error)
				logger.error(`[ManagedIndexer] Failed to upsert file ${filePath}: ${errorMessage}`)
			}
		})
	}

	/**
	 * Call this function from ClineProvider when a profile change occurs
	 */
	async onKilocodeTokenChange() {
		this.dispose()
		await this.start()
	}

	async onDidChangeWorkspaceFolders(e: vscode.WorkspaceFoldersChangeEvent) {
		// TODO we could more intelligently handle this instead of going scorched earth
		this.dispose()
		await this.start()
	}
}
