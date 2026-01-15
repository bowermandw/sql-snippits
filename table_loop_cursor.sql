DECLARE @table_id INT
DECLARE [table_cursor] CURSOR LOCAL FORWARD_ONLY READ_ONLY FORWARD_ONLY
    SELECT [table_id] FROM [table];

OPEN [table_cursor];
FETCH NEXT FROM [table_cursor]
INTO
    @table_id;

WHILE @@FETCH_STATUS = 0
BEGIN
    -- do something

    FETCH NEXT FROM [table_cursor]
    INTO
        @table_id;
END;

CLOSE [table_cursor];
DEALLOCATE [table_cursor];