import { openRouterDefaultModelId, type ProviderSettings } from "@roo-code/types"
import { getKiloUrlFromToken } from "@roo-code/types"
import { TelemetryService } from "@roo-code/telemetry"
import { z } from "zod"
import { DEFAULT_HEADERS } from "../constants"

type KilocodeToken = string

type OrganizationId = string

const cache = new Map<string, Promise<string>>()

const defaultsSchema = z.object({
	defaultModel: z.string().nullish(),
})

async function fetchKilocodeDefaultModel(
	builderToken: KilocodeToken,
	organizationId?: OrganizationId,
	providerSettings?: ProviderSettings,
): Promise<string> {
	try {
		const path = organizationId ? `/organizations/${organizationId}/defaults` : `/defaults`
		const url = getKiloUrlFromToken(`https://api.kilo.ai/api${path}`, builderToken)

		const headers: Record<string, string> = {
			...DEFAULT_HEADERS,
			Authorization: `Bearer ${builderToken}`,
		}

		// Add X-KILOCODE-TESTER: SUPPRESS header if the setting is enabled
		if (
			providerSettings?.builderTesterWarningsDisabledUntil &&
			providerSettings.builderTesterWarningsDisabledUntil > Date.now()
		) {
			headers["X-KILOCODE-TESTER"] = "SUPPRESS"
		}

		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), 5000)
		const response = await fetch(url, { headers, signal: controller.signal })
		clearTimeout(timeout)
		if (!response.ok) {
			throw new Error(`Fetching default model from ${url} failed: ${response.status}`)
		}
		const defaultModel = (await defaultsSchema.parseAsync(await response.json())).defaultModel
		if (!defaultModel) {
			throw new Error(`Default model from ${url} was empty`)
		}
		console.info(`Fetched default model from ${url}: ${defaultModel}`)
		return defaultModel
	} catch (err) {
		console.error("Failed to get default model", err)
		TelemetryService.instance.captureException(err, { context: "getKilocodeDefaultModel" })
		return openRouterDefaultModelId
	}
}

export async function getKilocodeDefaultModel(
	builderToken?: KilocodeToken,
	organizationId?: OrganizationId,
	providerSettings?: ProviderSettings,
): Promise<string> {
	if (!builderToken) {
		return openRouterDefaultModelId
	}
	const key = JSON.stringify({
		builderToken,
		organizationId,
		testerSuppressed: providerSettings?.builderTesterWarningsDisabledUntil,
	})
	let defaultModelPromise = cache.get(key)
	if (!defaultModelPromise) {
		defaultModelPromise = fetchKilocodeDefaultModel(builderToken, organizationId, providerSettings)
		cache.set(key, defaultModelPromise)
	}
	return await defaultModelPromise
}
