import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { applyEnvOverrides, PROVIDER_ENV_VAR, BUILDER_PREFIX, KILO_PREFIX } from "../env-config.js"
import type { CLIConfig } from "../types.js"

describe("env-overrides", () => {
	const originalEnv = process.env
	let testConfig: CLIConfig

	beforeEach(() => {
		// Reset environment variables before each test
		process.env = { ...originalEnv }

		// Clear any BUILDER_* or KILO_* environment variables to ensure clean test state
		for (const key of Object.keys(process.env)) {
			if (key.startsWith(BUILDER_PREFIX) || key.startsWith(KILO_PREFIX)) {
				delete process.env[key]
			}
		}

		// Create a test config
		testConfig = {
			version: "1.0.0",
			mode: "code",
			telemetry: true,
			provider: "default",
			providers: [
				{
					id: "default",
					provider: "kilocode",
					builderToken: "test-token",
					builderModel: "anthropic/claude-sonnet-4.5",
					builderOrganizationId: "original-org-id",
				},
				{
					id: "anthropic-provider",
					provider: "anthropic",
					apiKey: "test-key",
					apiModelId: "claude-3-5-sonnet-20241022",
				},
			],
			autoApproval: {
				enabled: true,
			},
			theme: "dark",
			customThemes: {},
		}
	})

	afterEach(() => {
		// Restore original environment
		process.env = originalEnv
	})

	describe("KILO_PROVIDER override", () => {
		it("should override provider when KILO_PROVIDER is set and provider exists", () => {
			process.env[PROVIDER_ENV_VAR] = "anthropic-provider"

			const result = applyEnvOverrides(testConfig)

			expect(result.provider).toBe("anthropic-provider")
		})

		it("should not override provider when KILO_PROVIDER provider does not exist", () => {
			process.env[PROVIDER_ENV_VAR] = "nonexistent-provider"

			const result = applyEnvOverrides(testConfig)

			expect(result.provider).toBe("default")
		})

		it("should not override provider when KILO_PROVIDER is empty", () => {
			process.env[PROVIDER_ENV_VAR] = ""

			const result = applyEnvOverrides(testConfig)

			expect(result.provider).toBe("default")
		})
	})

	describe("BUILDER_* overrides for kilocode provider", () => {
		it("should transform BUILDER_MODEL to builderModel", () => {
			process.env[`${BUILDER_PREFIX}MODEL`] = "anthropic/claude-opus-4.0"

			const result = applyEnvOverrides(testConfig)

			const provider = result.providers.find((p) => p.id === "default")
			expect(provider?.builderModel).toBe("anthropic/claude-opus-4.0")
		})

		it("should transform BUILDER_ORGANIZATION_ID to builderOrganizationId", () => {
			process.env[`${BUILDER_PREFIX}ORGANIZATION_ID`] = "new-org-id"

			const result = applyEnvOverrides(testConfig)

			const provider = result.providers.find((p) => p.id === "default")
			expect(provider?.builderOrganizationId).toBe("new-org-id")
		})

		it("should handle multiple BUILDER_* overrides", () => {
			process.env[`${BUILDER_PREFIX}MODEL`] = "anthropic/claude-opus-4.0"
			process.env[`${BUILDER_PREFIX}ORGANIZATION_ID`] = "new-org-id"
			process.env[`${BUILDER_PREFIX}TOKEN`] = "new-token"

			const result = applyEnvOverrides(testConfig)

			const provider = result.providers.find((p) => p.id === "default")
			expect(provider?.builderModel).toBe("anthropic/claude-opus-4.0")
			expect(provider?.builderOrganizationId).toBe("new-org-id")
			expect(provider?.builderToken).toBe("new-token")
		})
	})

	describe("KILO_* overrides for non-kilocode providers", () => {
		it("should transform KILO_API_KEY to apiKey for non-kilocode provider", () => {
			process.env[PROVIDER_ENV_VAR] = "anthropic-provider"
			process.env[`${KILO_PREFIX}API_KEY`] = "new-key"

			const result = applyEnvOverrides(testConfig)

			expect(result.provider).toBe("anthropic-provider")
			const provider = result.providers.find((p) => p.id === "anthropic-provider")
			expect(provider?.apiKey).toBe("new-key")
		})

		it("should transform KILO_API_MODEL_ID to apiModelId", () => {
			process.env[PROVIDER_ENV_VAR] = "anthropic-provider"
			process.env[`${KILO_PREFIX}API_MODEL_ID`] = "claude-3-opus-20240229"

			const result = applyEnvOverrides(testConfig)

			const provider = result.providers.find((p) => p.id === "anthropic-provider")
			expect(provider?.apiModelId).toBe("claude-3-opus-20240229")
		})

		it("should transform KILO_BASE_URL to baseUrl", () => {
			process.env[PROVIDER_ENV_VAR] = "anthropic-provider"
			process.env[`${KILO_PREFIX}BASE_URL`] = "https://api.example.com"

			const result = applyEnvOverrides(testConfig)

			const provider = result.providers.find((p) => p.id === "anthropic-provider")
			expect(provider?.baseUrl).toBe("https://api.example.com")
		})

		it("should not apply KILO_* overrides to kilocode provider", () => {
			process.env[PROVIDER_ENV_VAR] = "kilocode"
			process.env[`${KILO_PREFIX}API_KEY`] = "should-not-apply"

			const result = applyEnvOverrides(testConfig)

			const provider = result.providers.find((p) => p.id === "default")
			expect(provider?.apiKey).toBeUndefined()
		})

		it("should not apply BUILDER_* overrides to non-kilocode provider", () => {
			process.env[PROVIDER_ENV_VAR] = "anthropic-provider"
			process.env[`${BUILDER_PREFIX}MODEL`] = "should-not-apply"

			const result = applyEnvOverrides(testConfig)

			const provider = result.providers.find((p) => p.id === "anthropic-provider")
			expect(provider?.builderModel).toBeUndefined()
		})
	})

	describe("Combined overrides", () => {
		it("should apply both provider and field overrides together for non-kilocode provider", () => {
			process.env[PROVIDER_ENV_VAR] = "anthropic-provider"
			process.env[`${KILO_PREFIX}API_MODEL_ID`] = "claude-3-opus-20240229"
			process.env[`${KILO_PREFIX}API_KEY`] = "new-key"

			const result = applyEnvOverrides(testConfig)

			expect(result.provider).toBe("anthropic-provider")
			const provider = result.providers.find((p) => p.id === "anthropic-provider")
			expect(provider?.apiModelId).toBe("claude-3-opus-20240229")
			expect(provider?.apiKey).toBe("new-key")
		})

		it("should apply both provider and field overrides together for kilocode provider", () => {
			process.env[PROVIDER_ENV_VAR] = "default"
			process.env[`${BUILDER_PREFIX}MODEL`] = "anthropic/claude-opus-4.0"
			process.env[`${BUILDER_PREFIX}ORGANIZATION_ID`] = "new-org-id"

			const result = applyEnvOverrides(testConfig)

			expect(result.provider).toBe("default")
			const provider = result.providers.find((p) => p.id === "default")
			expect(provider?.builderModel).toBe("anthropic/claude-opus-4.0")
			expect(provider?.builderOrganizationId).toBe("new-org-id")
		})
	})

	describe("Edge cases", () => {
		it("should handle empty config providers array", () => {
			testConfig.providers = []

			const result = applyEnvOverrides(testConfig)

			expect(result.providers).toEqual([])
		})

		it("should handle config with no current provider", () => {
			testConfig.provider = "nonexistent"

			const result = applyEnvOverrides(testConfig)

			expect(result).toEqual(testConfig)
		})

		it("should handle empty string override values for BUILDER_*", () => {
			process.env[`${BUILDER_PREFIX}MODEL`] = ""

			const result = applyEnvOverrides(testConfig)

			// Empty strings should not trigger overrides
			const provider = result.providers.find((p) => p.id === "default")
			expect(provider?.builderModel).toBe("anthropic/claude-sonnet-4.5")
		})

		it("should handle empty string override values for KILO_*", () => {
			process.env[PROVIDER_ENV_VAR] = "anthropic-provider"
			process.env[`${KILO_PREFIX}API_KEY`] = ""

			const result = applyEnvOverrides(testConfig)

			// Empty strings should not trigger overrides
			const provider = result.providers.find((p) => p.id === "anthropic-provider")
			expect(provider?.apiKey).toBe("test-key")
		})

		it("should ignore BUILDER_ with no field name", () => {
			process.env[BUILDER_PREFIX.slice(0, -1)] = "value"

			const result = applyEnvOverrides(testConfig)

			// Should not modify anything
			expect(result).toEqual(testConfig)
		})

		it("should ignore KILO_PROVIDER since it's handled separately", () => {
			process.env[PROVIDER_ENV_VAR] = "anthropic-provider"

			const result = applyEnvOverrides(testConfig)

			// KILO_PROVIDER should change the provider but not add a 'provider' field
			expect(result.provider).toBe("anthropic-provider")

			const provider = result.providers.find((p) => p.id === "anthropic-provider")
			expect(provider?.provider).toBe("anthropic") // Original value
		})
	})
})
