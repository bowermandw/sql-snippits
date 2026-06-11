CREATE OR ALTER PROCEDURE dbo.rebuild_attribute_1_mapping
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRAN;

    -- L1: record-weighted most popular value per A
    ;WITH a_rank AS (
        SELECT column_a, attribute_1_value,
               ROW_NUMBER() OVER (PARTITION BY column_a
                                  ORDER BY SUM(record_count) DESC, attribute_1_value) AS rn
        FROM dbo.attribute_1_facts
        GROUP BY column_a, attribute_1_value
    )
    SELECT column_a, attribute_1_value AS l1_value INTO #l1 FROM a_rank WHERE rn = 1;

    -- L2: record-weighted mode per (A,B), kept only where it differs from L1
    ;WITH ab_rank AS (
        SELECT f.column_a, f.column_b, f.attribute_1_value, l1.l1_value,
               ROW_NUMBER() OVER (PARTITION BY f.column_a, f.column_b
                                  ORDER BY SUM(f.record_count) DESC, f.attribute_1_value) AS rn
        FROM dbo.attribute_1_facts f
        JOIN #l1 l1 ON l1.column_a = f.column_a
        GROUP BY f.column_a, f.column_b, f.attribute_1_value, l1.l1_value
    )
    SELECT column_a, column_b, attribute_1_value AS l2_value INTO #l2
    FROM ab_rank WHERE rn = 1 AND attribute_1_value <> l1_value;

    TRUNCATE TABLE dbo.attribute_1_mapping;

    INSERT dbo.attribute_1_mapping ([level], column_a, attribute_1_value)
    SELECT 1, column_a, l1_value FROM #l1;

    INSERT dbo.attribute_1_mapping ([level], column_a, column_b, attribute_1_value)
    SELECT 2, column_a, column_b, l2_value FROM #l2;

    -- L3: only full keys whose value disagrees with the default in effect above them
    INSERT dbo.attribute_1_mapping
        ([level], column_a, column_b, column_c, column_d, column_e, attribute_1_value)
    SELECT 3, f.column_a, f.column_b, f.column_c, f.column_d, f.column_e, f.attribute_1_value
    FROM dbo.attribute_1_facts f
    JOIN #l1 l1 ON l1.column_a = f.column_a
    LEFT JOIN #l2 l2 ON l2.column_a = f.column_a AND l2.column_b = f.column_b
    WHERE f.attribute_1_value <> COALESCE(l2.l2_value, l1.l1_value);

    DROP TABLE #l1, #l2;
    COMMIT;
END