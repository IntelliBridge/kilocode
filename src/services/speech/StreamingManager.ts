// kilocode_change - new file: Streaming text deduplication and session management

import { IStreamingManager } from "./types"

/**
 * StreamingManager - Manages streaming transcription state and text deduplication
 *
 * Handles:
 * - Session text accumulation
 * - Word-level deduplication between overlapping chunks
 * - Previous chunk text tracking for overlap detection
 * - Hot word detection for auto-send functionality
 */
export class StreamingManager implements IStreamingManager {
	private sessionText: string = ""
	private previousChunkText: string = ""
	private hotWordEnabled: boolean = false
	private hotWordPhrase: string = "send the command"

	/**
	 * Configure hot word detection
	 * @param enabled Whether hot word detection is enabled
	 * @param phrase The phrase to detect (default: "send the command")
	 */
	configureHotWord(enabled: boolean, phrase: string = "send the command"): void {
		this.hotWordEnabled = enabled
		this.hotWordPhrase = phrase.toLowerCase()
		console.log(`[StreamingManager] Hot word detection ${enabled ? "enabled" : "disabled"}: "${phrase}"`)
	}

	/**
	 * Add new chunk text with deduplication and hot word detection
	 * @param chunkId Chunk identifier (for logging)
	 * @param text Raw transcribed text from chunk
	 * @returns Object with deduplicated text and hot word detection result
	 */
	addChunkText(chunkId: number, text: string): string {
		// Deduplicate with previous chunk
		const deduplicatedText = this.deduplicateOverlap(this.previousChunkText, text)

		// Update previous chunk text for next iteration
		this.previousChunkText = text

		// Add to session text
		if (deduplicatedText) {
			this.sessionText += (this.sessionText ? " " : "") + deduplicatedText
			console.log(
				`[StreamingManager] Chunk ${chunkId}: Added ${deduplicatedText.length} chars, ` +
					`session total: ${this.sessionText.length} chars`,
			)
		} else {
			console.log(`[StreamingManager] Chunk ${chunkId}: No new text after deduplication`)
		}

		return deduplicatedText
	}

	/**
	 * Check if hot word is detected in the current session text
	 * @returns Object with detection status and cleaned text (with hot word removed)
	 */
	checkHotWord(): { detected: boolean; cleanedText: string } {
		if (!this.hotWordEnabled || !this.sessionText) {
			return { detected: false, cleanedText: this.sessionText }
		}

		const lowerText = this.sessionText.toLowerCase()
		const hotWordIndex = lowerText.indexOf(this.hotWordPhrase)

		if (hotWordIndex !== -1) {
			// Hot word detected - remove it from the text
			const beforeHotWord = this.sessionText.substring(0, hotWordIndex)
			const afterHotWord = this.sessionText.substring(hotWordIndex + this.hotWordPhrase.length)
			// Combine and normalize multiple spaces to single space
			const cleanedText = (beforeHotWord + " " + afterHotWord).replace(/\s+/g, " ").trim()

			console.log(`[StreamingManager] Hot word detected: "${this.hotWordPhrase}"`)
			console.log(`[StreamingManager] Cleaned text: "${cleanedText}"`)

			return { detected: true, cleanedText }
		}

		return { detected: false, cleanedText: this.sessionText }
	}

	/**
	 * Get accumulated session text
	 */
	getSessionText(): string {
		return this.sessionText
	}

	/**
	 * Get previous chunk text (for debugging)
	 */
	getPreviousChunkText(): string {
		return this.previousChunkText
	}

	/**
	 * Reset all state (preserves hot word configuration)
	 */
	reset(): void {
		this.sessionText = ""
		this.previousChunkText = ""
		console.log("[StreamingManager] State reset")
	}

	/**
	 * Deduplicate overlapping text between chunks
	 *
	 * Strategy:
	 * - Compare last N words of previous text with first N words of current text
	 * - Find longest matching sequence (up to 5 words)
	 * - Return current text with overlap removed
	 *
	 * @param previousText Text from previous chunk
	 * @param currentText Text from current chunk
	 * @returns Current text with overlap removed
	 */
	private deduplicateOverlap(previousText: string, currentText: string): string {
		if (!previousText) {
			return currentText
		}

		const prevWords = previousText.trim().split(/\s+/)
		const currWords = currentText.trim().split(/\s+/)

		let overlapLength = 0
		const maxOverlap = Math.min(5, prevWords.length, currWords.length)

		// Find longest matching sequence
		for (let i = 1; i <= maxOverlap; i++) {
			const prevSuffix = prevWords.slice(-i).join(" ").toLowerCase()
			const currPrefix = currWords.slice(0, i).join(" ").toLowerCase()

			if (prevSuffix === currPrefix) {
				overlapLength = i
			}
		}

		if (overlapLength > 0) {
			console.log(
				`[StreamingManager] Detected ${overlapLength}-word overlap: ` +
					`"${currWords.slice(0, overlapLength).join(" ")}"`,
			)
		}

		return currWords.slice(overlapLength).join(" ")
	}
}
