# Plan: Convert Student Ledgers table to card layout

## Problem
The Student Ledgers section in `pages/admin/FeesPayments.tsx` uses a wide table (`min-w-[760px]`) inside a horizontally scrollable container. Admins must drag both horizontal and vertical scrollbars to inspect individual student balances.

## Goal
Replace the table with a responsive 2-column card grid that shows the same ledger data without horizontal scrolling, while preserving existing filters, search, class filter, status filter, and Load More pagination.

## Scope
- File: `pages/admin/FeesPayments.tsx`
- Section: Student Ledgers table rendered around lines 4989-5138
- Keep all existing filtering, search, and `ledgersLimit` "Load More" behavior intact
- No changes to ledger calculations, modals, or data fetching

## Decisions
1. **Card content**: Each card shows the equivalent of one table row: student avatar + name, class, total due, paid, balance, status badge, edit button, plus fee chips derived from `ledger.fees`.
2. **Grid**: `grid grid-cols-1 md:grid-cols-2 gap-4` so admins get 2 cards per row on tablet/desktop and 1 on mobile.
3. **Fee chips**: Render compact fee chips on each card so the total-due breakdown is visible without opening the modal.
4. **Scroll container**: Replace `overflow-x-auto` table wrapper with a vertically scrollable card container (`max-h-[480px] overflow-y-auto`).
5. **Loading/empty states**: Preserve current skeleton rows and empty-state messaging in card form.
6. **Load More**: Keep the existing `ledgersLimit` + `setLedgersLimit(prev => prev + 25)` pattern, rendered as a full-width button below the card grid.
7. **Accessibility**: Use semantic button elements, keep status badges readable, and maintain existing hover/focus styles.

## Implementation steps
1. Replace the `<table>` block with a card grid wrapper using the project's existing card style tokens (`rounded-[24px]`, `border border-slate-200/80`, `bg-white`, etc.).
2. Map `filteredLedgerRows.slice(0, ledgersLimit)` to cards instead of `<tr>` rows.
3. Inside each card:
   - Header: `StudentAvatar`, student name, class label
   - Body: fee chips + money row (Total Due, Paid, Balance) + status badge
   - Footer: Edit button calling `openLedgerPayments(ledger.id, ledger.studentId)`
4. Preserve the loading skeleton and empty-state UI, adapted for cards.
5. Keep the "Load More Ledgers" button unchanged except for placement below the grid.

## Validation
- Verify no horizontal scrollbar appears in the Student Ledgers section at common viewport widths.
- Confirm filters, search, and class filter still filter cards correctly.
- Confirm Load More still increments `ledgersLimit` and appends cards.
- Type-check the modified file with `tsc --noEmit` and ensure no new errors are introduced.
