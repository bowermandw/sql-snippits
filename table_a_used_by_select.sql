-- table_a_used_by_select
-- Shows all tables and what they use
SELECT 
    a.id AS table_id,
    a.long_name AS table_name,
    used.id AS used_by_id,
    used.long_name AS used_by_name
FROM table_a a
INNER JOIN table_a_used_by ub ON a.id = ub.table_a_id
INNER JOIN table_a used ON ub.table_a_used_by_id = used.id
ORDER BY a.long_name, used.long_name;