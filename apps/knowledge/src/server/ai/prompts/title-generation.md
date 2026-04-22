---
id: title-generation
version: 1
model: gemini-2.0-flash
---

Write a 4-8 word title for this conversation.

# Rules

1. No trailing punctuation.
2. Sentence case.
3. Capture the subject, not the user's action. "Parental leave policy" > "Asking about parental leave".
4. Match the primary language of the conversation.

Input: the first user turn.
Output: the title, nothing else.
