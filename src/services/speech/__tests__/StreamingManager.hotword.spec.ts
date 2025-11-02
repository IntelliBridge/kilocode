// kilocode_change - new file: Hot word detection tests for StreamingManager
import { describe, it, expect, beforeEach } from "vitest"
import { StreamingManager } from "../StreamingManager"

describe("StreamingManager - Hot Word Detection", () => {
	let manager: StreamingManager

	beforeEach(() => {
		manager = new StreamingManager()
	})

	describe("configureHotWord", () => {
		it("should enable hot word detection with default phrase", () => {
			manager.configureHotWord(true)
			const result = manager.checkHotWord()
			expect(result.detected).toBe(false)
		})

		it("should enable hot word detection with custom phrase", () => {
			manager.configureHotWord(true, "custom phrase")
			const result = manager.checkHotWord()
			expect(result.detected).toBe(false)
		})

		it("should disable hot word detection", () => {
			manager.configureHotWord(false)
			manager.addChunkText(0, "send the command")
			const result = manager.checkHotWord()
			expect(result.detected).toBe(false)
		})
	})

	describe("checkHotWord", () => {
		it("should detect hot word in session text", () => {
			manager.configureHotWord(true, "send the command")
			manager.addChunkText(0, "hello world send the command")

			const result = manager.checkHotWord()
			expect(result.detected).toBe(true)
			expect(result.cleanedText).toBe("hello world")
		})

		it("should detect hot word case-insensitively", () => {
			manager.configureHotWord(true, "send the command")
			manager.addChunkText(0, "hello SEND THE COMMAND world")

			const result = manager.checkHotWord()
			expect(result.detected).toBe(true)
			expect(result.cleanedText).toBe("hello world")
		})

		it("should remove hot word from beginning of text", () => {
			manager.configureHotWord(true, "send the command")
			manager.addChunkText(0, "send the command hello world")

			const result = manager.checkHotWord()
			expect(result.detected).toBe(true)
			expect(result.cleanedText).toBe("hello world")
		})

		it("should remove hot word from end of text", () => {
			manager.configureHotWord(true, "send the command")
			manager.addChunkText(0, "hello world send the command")

			const result = manager.checkHotWord()
			expect(result.detected).toBe(true)
			expect(result.cleanedText).toBe("hello world")
		})

		it("should remove hot word from middle of text", () => {
			manager.configureHotWord(true, "send the command")
			manager.addChunkText(0, "hello send the command world")

			const result = manager.checkHotWord()
			expect(result.detected).toBe(true)
			expect(result.cleanedText).toBe("hello world")
		})

		it("should not detect hot word when disabled", () => {
			manager.configureHotWord(false, "send the command")
			manager.addChunkText(0, "hello send the command world")

			const result = manager.checkHotWord()
			expect(result.detected).toBe(false)
			expect(result.cleanedText).toBe("hello send the command world")
		})

		it("should not detect partial matches", () => {
			manager.configureHotWord(true, "send the command")
			manager.addChunkText(0, "hello send the comma world")

			const result = manager.checkHotWord()
			expect(result.detected).toBe(false)
			expect(result.cleanedText).toBe("hello send the comma world")
		})

		it("should handle empty session text", () => {
			manager.configureHotWord(true, "send the command")

			const result = manager.checkHotWord()
			expect(result.detected).toBe(false)
			expect(result.cleanedText).toBe("")
		})

		it("should handle text with only hot word", () => {
			manager.configureHotWord(true, "send the command")
			manager.addChunkText(0, "send the command")

			const result = manager.checkHotWord()
			expect(result.detected).toBe(true)
			expect(result.cleanedText).toBe("")
		})

		it("should detect hot word across multiple chunks", () => {
			manager.configureHotWord(true, "send the command")
			manager.addChunkText(0, "hello world")
			manager.addChunkText(1, "more text send the command")

			const result = manager.checkHotWord()
			expect(result.detected).toBe(true)
			expect(result.cleanedText).toBe("hello world more text")
		})

		it("should work with custom hot word phrase", () => {
			manager.configureHotWord(true, "submit now")
			manager.addChunkText(0, "hello world submit now")

			const result = manager.checkHotWord()
			expect(result.detected).toBe(true)
			expect(result.cleanedText).toBe("hello world")
		})

		it("should preserve hot word configuration after reset", () => {
			manager.configureHotWord(true, "send the command")
			manager.addChunkText(0, "hello world")
			manager.reset()
			manager.addChunkText(0, "new text send the command")

			const result = manager.checkHotWord()
			expect(result.detected).toBe(true)
			expect(result.cleanedText).toBe("new text")
		})

		it("should handle multiple spaces around hot word", () => {
			manager.configureHotWord(true, "send the command")
			manager.addChunkText(0, "hello   send the command   world")

			const result = manager.checkHotWord()
			expect(result.detected).toBe(true)
			expect(result.cleanedText).toBe("hello world")
		})
	})

	describe("integration with deduplication", () => {
		it("should detect hot word after deduplication", () => {
			manager.configureHotWord(true, "send the command")

			// First chunk
			manager.addChunkText(0, "hello world")

			// Second chunk with overlap and hot word
			manager.addChunkText(1, "world send the command")

			const result = manager.checkHotWord()
			expect(result.detected).toBe(true)
			// "world" should be deduplicated, leaving "hello world send the command"
			// After removing hot word: "hello world"
			expect(result.cleanedText).toBe("hello world")
		})

		it("should handle hot word in overlapping content", () => {
			manager.configureHotWord(true, "send the command")

			// First chunk ends with part of hot word
			manager.addChunkText(0, "hello send the")

			// Second chunk starts with rest of hot word
			manager.addChunkText(1, "the command world")

			const result = manager.checkHotWord()
			// Should detect "send the command" in accumulated text
			expect(result.detected).toBe(true)
		})
	})
})
