CREATE TEMPORARY TABLE `manual_balance_adjustment_ids` (
  `id` INT NOT NULL PRIMARY KEY
);

INSERT INTO `manual_balance_adjustment_ids` (`id`)
SELECT `id`
FROM `Transaction`
WHERE `description` LIKE 'Manual balance adjustment to $%';

DELETE `allocation`
FROM `CashLotAllocation` AS `allocation`
INNER JOIN `manual_balance_adjustment_ids` AS `ids`
  ON `ids`.`id` = `allocation`.`expenseTransactionId`;

DELETE `lot`
FROM `CashLot` AS `lot`
INNER JOIN `manual_balance_adjustment_ids` AS `ids`
  ON `ids`.`id` = `lot`.`withdrawalTransactionId`;

DELETE `transaction`
FROM `Transaction` AS `transaction`
INNER JOIN `manual_balance_adjustment_ids` AS `ids`
  ON `ids`.`id` = `transaction`.`id`;

DROP TEMPORARY TABLE `manual_balance_adjustment_ids`;
