ALTER TABLE `Category`
  ADD CONSTRAINT `chk_Category_dueDay_range`
  CHECK (`dueDay` IS NULL OR (`dueDay` >= 1 AND `dueDay` <= 31));
