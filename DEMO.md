# SpendSense demo

Allow about three minutes. Use the invented records in `public/demo-transactions.csv` and a fresh account or a ledger with no other October 2026 records.

1. Open SpendSense and sign in. Download the synthetic demo CSV from the landing page.
2. Open Import. Upload the file, use ISO dates and positive expenses, and verify the Type column identifies expense/income. Review seven rows and save.
3. Open Dashboard. Set From **2026-10-01**, To **2026-10-31**, Category **All categories**. Expect spending **$96.25**, income **$2,500.00**, net cash flow **$2,403.75**, and **7 confirmed transactions**.
4. Open Actions. Enter merchant **Starbucks**, category **Coffee & Drinks**, and the same October dates. Prepare a review: **2 transactions**, **$10.75** spending, both previously Dining. Show that preparing a review has not changed the ledger.
5. Approve. Show the Approved history entry. On Dashboard, select Coffee & Drinks: **$10.75**. Switch back to All categories: spending remains **$96.25**. Dining is now **$15.00**.
6. Reload to show persistence. Re-upload the same CSV to demonstrate duplicate-file protection.

To repeat, approve a Starbucks review back to Dining first. To demonstrate cancellation, prepare a review and cancel; the current categories must remain.

## Optional PDF segment

For the PDF import segment, download `/demo-statement.pdf` from Import. Use it **instead of** the demo CSV in a fresh ledger: the two fixtures represent the same seven records, and duplicate protection is per file, not across formats. Inspect extracted text and skipped headers, confirm completeness/USD, review rows, assign categories as needed, and save. Expect the same $96.25 expense and $2,500.00 income totals. Extracted PDF categories start as Uncategorized; choose categories during review before demonstrating recategorization.

## Optional receipt and quick-entry segment

On Import, use **Read a receipt**, download `demo-receipt.png`, and upload it. Check the extracted text, prepare a transaction draft, and verify Cafe Example, 2026-10-05, and $12.50. Correct or choose a category, confirm all fields and USD currency, and approve. Receipt OCR is local and uses no AI credits.

Use **Describe a transaction** and enter “Spent $5 at Demo Cafe on 2026-10-05”. Prepare, review, and approve the draft. Show that preparing leaves totals unchanged until approval. These additional entries change the main demo totals, so record this segment after the seven-record dashboard sequence or use a separate account. Repeating the same input demonstrates duplicate protection; it does not deduplicate a photo against a different description or CSV record.

## Optional AI segment

Include only after successfully verifying an account with DeepSpace AI credits. Ask “How much did I spend in October 2026?” ($96.25 in the isolated demo), then “Propose categorizing my Starbucks transactions in October 2026 as Coffee & Drinks.” Review, approve, and show the update.

Without credits, say: “The assistant and its financial tools are integrated, but live model generation is not verified because the account requires credits. I will demonstrate the tested review and approval workflow directly.” Do not present a manual review as AI-generated.

## Engineering points

- DeepSpace provides authentication, durable records, live updates, and deployment.
- Money uses integer cents; backend code calculates summaries.
- Model tools read and propose; only user controls apply approvals.
- Reviews preserve original transaction values. Approval checks ownership and current values, and runs serialized with other app actions.
- Two-user tests cover privacy, cancellation, stale reviews, replay, CSV corrections, and live dashboard updates.

## Submission

- Verify production sign-in, CSV import, category approval, and dashboard.
- Record the demo and accurately label the AI credit limitation.
- Include the deployed app URL, source, this script, and tested/future scope from README.
- Deadline: **October 5, 2026 at 11:50 PM America/New_York**.
