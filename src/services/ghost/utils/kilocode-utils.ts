import { getKiloBaseUriFromToken, AUTOCOMPLETE_PROVIDER_MODELS, AutocompleteProviderKey } from "@roo-code/types"

export { AUTOCOMPLETE_PROVIDER_MODELS }
export type { AutocompleteProviderKey }

/**
 * Check if the Builder account has a positive balance
 * @param builderToken - The Builder JWT token
 * @param builderOrganizationId - Optional organization ID to include in headers
 * @returns Promise<boolean> - True if balance > 0, false otherwise
 */
export async function checkKilocodeBalance(builderToken: string, builderOrganizationId?: string): Promise<boolean> {
	try {
		const baseUrl = getKiloBaseUriFromToken(builderToken)

		const headers: Record<string, string> = {
			Authorization: `Bearer ${builderToken}`,
		}

		if (builderOrganizationId) {
			headers["X-KiloCode-OrganizationId"] = builderOrganizationId
		}

		const response = await fetch(`${baseUrl}/api/profile/balance`, {
			headers,
		})

		if (!response.ok) {
			return false
		}

		const data = await response.json()
		const balance = data.balance ?? 0
		return balance > 0
	} catch (error) {
		console.error("Error checking kilocode balance:", error)
		return false
	}
}
