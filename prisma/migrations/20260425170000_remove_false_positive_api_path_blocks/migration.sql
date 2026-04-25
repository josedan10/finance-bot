-- Deactivate incorrectly blocked valid API endpoints that were added as suspicious paths.
UPDATE `SecurityPathBlock`
SET
	`active` = false,
	`removedAt` = IFNULL(`removedAt`, NOW()),
	`updatedAt` = NOW()
WHERE
	`active` = true
	AND `removedAt` IS NULL
	AND LOWER(`normalizedPath`) IN (
		'/api/exchange-rates/latest',
		'/api/categories',
		'/api/budgets',
		'/api/transactions',
		'/api/payment-methods'
	);
