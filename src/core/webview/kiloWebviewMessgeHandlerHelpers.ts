// kilocode_change - new file

import { GlobalState } from "@roo-code/types"
import { WebviewMessage } from "../../shared/WebviewMessage"
import { ClineProvider } from "./ClineProvider"

export async function refreshOrganizationModes(
	message: WebviewMessage,
	provider: ClineProvider,
	updateGlobalState: <K extends keyof GlobalState>(key: K, value: GlobalState[K]) => Promise<void>,
) {
	if (message.apiConfiguration?.builderToken) {
		try {
			const orgModes = await provider.customModesManager.fetchOrganizationModes(
				message.apiConfiguration.builderToken,
				message.apiConfiguration.builderOrganizationId,
				message.apiConfiguration.builderTesterWarningsDisabledUntil,
			)

			// Refresh custom modes with organization modes
			await provider.customModesManager.refreshWithOrganizationModes(orgModes)

			// Update global state
			const customModes = await provider.customModesManager.getCustomModes()
			await updateGlobalState("customModes", customModes)

			provider.log(
				`Organization modes refreshed: ${orgModes.length} organization modes, ${customModes.length} total modes`,
			)
		} catch (error) {
			provider.log(
				`Failed to fetch organization modes: ${error instanceof Error ? error.message : String(error)}`,
			)
			// Continue even if organization modes fetch fails
		}
	}
}

export async function fetchAndRefreshOrganizationModesOnStartup(
	provider: ClineProvider,
	updateGlobalState: <K extends keyof GlobalState>(key: K, value: GlobalState[K]) => Promise<void>,
) {
	const startupState = await provider.getState()
	if (startupState.apiConfiguration.builderToken && startupState.apiConfiguration.builderOrganizationId) {
		try {
			const orgModes = await provider.customModesManager.fetchOrganizationModes(
				startupState.apiConfiguration.builderToken,
				startupState.apiConfiguration.builderOrganizationId,
				startupState.apiConfiguration.builderTesterWarningsDisabledUntil,
			)

			if (orgModes.length > 0) {
				await provider.customModesManager.refreshWithOrganizationModes(orgModes)
				const updatedCustomModes = await provider.customModesManager.getCustomModes()
				await updateGlobalState("customModes", updatedCustomModes)

				provider.log(
					`Loaded ${orgModes.length} organization modes on startup for organization ${startupState.apiConfiguration.builderOrganizationId}`,
				)
			}
		} catch (error) {
			provider.log(
				`Failed to fetch organization modes on startup: ${error instanceof Error ? error.message : String(error)}`,
			)
			// Continue with startup even if organization modes fetch fails
		}
	}
}
