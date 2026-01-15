-- table_a_relies_on_select
-- Shows all tables and what they rely on
SELECT 
    a.id AS table_id,
    a.long_name AS table_name,
    relies.id AS relies_on_id,
    relies.long_name AS relies_on_name
FROM table_a a
INNER JOIN table_a_relies_on ro ON a.id = ro.table_a_id
INNER JOIN table_a relies ON ro.table_a_relies_on_id = relies.id
ORDER BY a.long_name, relies.long_name;