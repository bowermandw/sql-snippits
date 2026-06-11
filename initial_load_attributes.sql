;WITH agg AS (
    SELECT column_a, column_b, column_c, column_d, column_e,
           attribute_1_value, COUNT(*) AS cnt
    FROM dbo.PreexistingAttributes
    GROUP BY column_a, column_b, column_c, column_d, column_e, attribute_1_value
),
pick AS (
    SELECT *,
           ROW_NUMBER() OVER (PARTITION BY column_a, column_b, column_c, column_d, column_e
                              ORDER BY cnt DESC, attribute_1_value) AS rn
    FROM agg
)
INSERT dbo.attribute_1_facts
    (column_a, column_b, column_c, column_d, column_e, attribute_1_value, record_count)
SELECT column_a, column_b, column_c, column_d, column_e, attribute_1_value, cnt
FROM pick
WHERE rn = 1;