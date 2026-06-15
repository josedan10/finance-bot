UPDATE `Transaction`
SET `type` = CASE
  WHEN `type` = 'debit' THEN 'expense'
  WHEN `type` = 'credit' THEN 'income'
  ELSE `type`
END;
