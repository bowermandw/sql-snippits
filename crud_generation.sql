DECLARE @table_filter VARCHAR(50) = 'enter_table_name%';
 
-- INSERT
DECLARE @useAndSets VARCHAR(120) = 'SET QUOTED_IDENTIFIER ON \r\nGO \r\nSET ANSI_NULLS ON \r\nGO \r\n'
DECLARE @ncAndLog VARCHAR(4000) = 'SET NOCOUNT ON; EXECUTE [crd].[procedure_history_insert] @user_id = @user_id, @proc_id = @@PROCID;';
SELECT
    CONCAT(
        @useAndSets,
        'CREATE OR ALTER PROCEDURE ',
        'crd.',
        REPLACE([t].[TABLE_NAME], 'tbl', 'sp'),
        '_insert',
        ' (@user_id VARCHAR(20), ',
        [AllColCommaParam],
        ') AS BEGIN ',
        CONCAT(
            '\r\n    /************************************************\r\n    Procedure Name: ',
            'crd.',
            REPLACE([t].[TABLE_NAME], 'tbl', 'sp'),
            '_insert',
            '\r\n            Author: Douglas Bowerman\r\n       Create Date: ',
            CONVERT(VARCHAR(30), GETDATE(), 101),
            '\r\n           Purpose: \r\n\r\n    Params:\r\n',
            '        @user_id                   = myId of the user calling the proc (for logging purposes)\r\n',
            [ParamLinesWDesc],
            '\r\n\r\n    Notes:\r\n        @user_id is required.\r\n\r\n    Revised | Author  | Notes\r\n\r\n    ************************************************/'
        ),
        @ncAndLog,
        CONVERT(VARCHAR(MAX), [AllColDeclareLocal]),
        '; ',
        [AllColSetLocal],
        '; INSERT INTO  ',
        [t].[TABLE_SCHEMA],
        '.',
        [t].[TABLE_NAME],
        ' (',
        [c].[AllColInsertCols],
        ')',
        ' VALUES (',
        [c].[AllColInsertLocalValues],
        ') ',
        '; ',
        c.IdentityColSet,
        'SELECT * FROM ',
        [t].[TABLE_SCHEMA],
        '.',
        [t].[TABLE_NAME],
        ' WHERE ',
        [KeyColAndWhere],
        ';END; \r\nGO\r\n'
    ) AS [InsertScript]
FROM
    [INFORMATION_SCHEMA].[TABLES] [t]
    INNER JOIN (
        SELECT
        [TABLE_SCHEMA],
        [TABLE_NAME],
        STRING_AGG(
                CASE
                     WHEN [COLUMN_NAME] IN (
                         'created_date', 'created_by', 'updated_date', 'updated_by'
                     ) THEN NULL
                     ELSE
                         CONCAT(
                             '        @',
                             REPLACE(CONVERT(VARCHAR(MAX), [COLUMN_NAME]), ' ', '_'),
                             REPLICATE(' ', 25 - LEN([COLUMN_NAME])),
                             '= represents the ',
                             CONVERT(VARCHAR(MAX), [COLUMN_NAME]),
                             ' to insert records'
                         )
                END,
                '\r\n'
            )                                                       [ParamLinesWDesc],
        STRING_AGG(CASE COLUMNPROPERTY (OBJECT_ID(TABLE_NAME),COLUMN_NAME ,'IsIdentity')
        WHEN 1 THEN NULL
        ELSE '[' + CONVERT(VARCHAR(MAX), [COLUMN_NAME]) + ']' END , ', ') [AllColInsertCols],
        STRING_AGG(
                CASE
                     WHEN [COLUMN_NAME] IN ( 'created_date', 'updated_date' ) THEN
                         'GETDATE()'
                     WHEN [COLUMN_NAME] IN ( 'created_by', 'updated_by' ) THEN
                         '@user_id'
                     WHEN COLUMNPROPERTY (OBJECT_ID(TABLE_NAME),COLUMN_NAME ,'IsIdentity') = 1 THEN
                        NULL
                     ELSE
                         CONCAT(
                             '@',
                             REPLACE(CONVERT(VARCHAR(MAX), [COLUMN_NAME]), ' ', '_'),
                             '_local'
                         )
                END,
                ', '
            )                                                       [AllColInsertLocalValues],
        STRING_AGG(
                CASE
                     WHEN [COLUMN_NAME] IN (
                         'created_date', 'created_by', 'updated_date', 'updated_by'
                     ) THEN NULL
                     ELSE
                         CONCAT(
                             '@',
                             REPLACE(CONVERT(VARCHAR(MAX), [COLUMN_NAME]), ' ', '_'),
                             ' ',
                             CASE
                                  WHEN [DATA_TYPE] IN (
                                      'TINYINT', 'SMALLINT', 'INT', 'BIGINT',
                                      'DECIMAL', 'NUMERIC', 'DATETIME', 'UNIQUEIDENTIFIER'
                                  ) THEN 'VARCHAR '
                                  ELSE [DATA_TYPE]
                             END,
                             CASE WHEN [DATA_TYPE] = 'BIT' THEN ''
                             ELSE CONCAT('(',
                                ISNULL(
                                    CONVERT(
                                        VARCHAR(50),
                                        NULLIF(COALESCE(
                                                    [CHARACTER_MAXIMUM_LENGTH],
                                                    [NUMERIC_PRECISION],
                                                    50
                                                ), -1)
                                    ),
                                    'MAX'
                                ), ') = NULL') END
                         )
                END,
                ', '
            )                                                       [AllColCommaParam],
        STRING_AGG(
                CASE
                     WHEN [COLUMN_NAME] IN (
                         'created_date', 'created_by', 'updated_date', 'updated_by'
                     ) THEN NULL
                     ELSE
                         CONCAT(
                             'DECLARE @',
                             REPLACE(CONVERT(VARCHAR(MAX), [COLUMN_NAME]), ' ', '_'),
                             '_local ',
                             CASE
                                  WHEN [DATA_TYPE] IN (
                                      'TINYINT', 'SMALLINT', 'INT', 'BIGINT',
                                      'DECIMAL', 'NUMERIC'
                                  ) THEN
                                      CONCAT(
                                          [DATA_TYPE],
                                          CASE
                                               WHEN [DATA_TYPE] IN ( 'DECIMAL', 'NUMERIC' ) THEN
                                                   CONCAT(
                                                       '(',
                                                       [NUMERIC_PRECISION],
                                                       ', ',
                                                       [NUMERIC_SCALE],
                                                       ')'
                                                   )
                                               ELSE ''
                                          END
                                      )
                                  WHEN [DATA_TYPE] IN ( 'DATETIME',
                                                        'UNIQUEIDENTIFIER',
                                                        'BIT'
                                  ) THEN
                                          [DATA_TYPE]
                                  ELSE
                                          CONCAT([DATA_TYPE], '(',
                             ISNULL(
                                 CONVERT(
                                     VARCHAR(50),
                                     NULLIF(COALESCE(
                                                [CHARACTER_MAXIMUM_LENGTH],
                                                [NUMERIC_PRECISION],
                                                50
                                            ), -1)
                                 ),
                                 'MAX'
                             ), ')')
                             END
                         )
                END,
                '; '
            )                                                       [AllColDeclareLocal],
        STRING_AGG(
                CASE
                     WHEN [COLUMN_NAME] IN (
                         'created_date', 'created_by', 'updated_date', 'updated_by'
                     ) THEN NULL
                     ELSE
                         CONCAT(
                             'SET @',
                             REPLACE(CONVERT(VARCHAR(MAX), [COLUMN_NAME]), ' ', '_'),
                             CASE
                                  WHEN [DATA_TYPE] IN (
                                      'TINYINT', 'SMALLINT', 'INT', 'BIGINT',
                                      'DECIMAL', 'NUMERIC'
                                  ) THEN
                                      CONCAT(
                                          '_local = TRY_PARSE(NULLIF(@',
                                          REPLACE(CONVERT(VARCHAR(MAX), [COLUMN_NAME]), ' ', '_'),
                                          ', '''') AS ',
                                          [DATA_TYPE],
                                          CASE
                                               WHEN [DATA_TYPE] IN ( 'DECIMAL', 'NUMERIC' ) THEN
                                                   CONCAT(
                                                       '(',
                                                       [NUMERIC_PRECISION],
                                                       ', ',
                                                       [NUMERIC_SCALE],
                                                       ')'
                                                   )
                                               ELSE ''
                                          END,
                                          ')'
                                      )
                                  WHEN [DATA_TYPE] IN ( 'DATETIME',
                                                        'UNIQUEIDENTIFIER'
                                  ) THEN
                                      CONCAT(
                                          '_local = CONVERT(',
                                          [DATA_TYPE],
                                          ', NULLIF(@',
                                          REPLACE(CONVERT(VARCHAR(MAX), [COLUMN_NAME]), ' ', '_'),
                                          ', ''''))'
                                      )
                                  ELSE
                                      CONCAT(
                                          '_local = NULLIF(@',
                                          REPLACE(CONVERT(VARCHAR(MAX), [COLUMN_NAME]), ' ', '_'),
                                          ', '''')'
                                      )
                             END
                         )
                END,
                '; '
            )                                                       [AllColSetLocal],
            STRING_AGG(
                CASE COLUMNPROPERTY (OBJECT_ID(TABLE_NAME),COLUMN_NAME ,'IsIdentity')
                WHEN 1 THEN CONCAT('SET @', CONVERT(VARCHAR(MAX), [COLUMN_NAME]), '_local = SCOPE_IDENTITY(); ')
                ELSE NULL
                END,
            ',') AS [IdentityColSet]
    FROM
        [INFORMATION_SCHEMA].[COLUMNS]
    GROUP BY
            [TABLE_SCHEMA],
            [TABLE_NAME]
    )                             [c]
    ON [c].[TABLE_SCHEMA]    = [t].[TABLE_SCHEMA]
        AND [c].[TABLE_NAME] = [t].[TABLE_NAME]
    LEFT OUTER JOIN (
        SELECT
        [a].[TABLE_SCHEMA],
        [a].[TABLE_NAME],
        STRING_AGG(
                CONCAT(
                    '([',
                    CONVERT(VARCHAR(MAX), [a].[COLUMN_NAME]),
                    '] = ',
                    '@',
                    REPLACE(CONVERT(VARCHAR(MAX), [a].[COLUMN_NAME]), ' ', '_'),
                    '_local)'
                    -- ' OR @',
                    -- REPLACE(CONVERT(VARCHAR(MAX), [a].[COLUMN_NAME]), ' ', '_'),
                    -- '_local IS NULL)'
                ),
                ' AND '
            ) [KeyColAndWhere],
        STRING_AGG(
                CONCAT(
                    '@',
                    REPLACE(CONVERT(VARCHAR(MAX), [a].[COLUMN_NAME]), ' ', '_'),
                    ' ',
                    CASE
                         WHEN [c].[DATA_TYPE] IN (
                             'TINYINT', 'SMALLINT', 'INT', 'BIGINT', 'DECIMAL', 'NUMERIC',
                             'UNIQUEIDENTIFIER'
                         ) THEN 'VARCHAR '
                         ELSE [c].[DATA_TYPE]
                    END,
                    '(',
                    COALESCE(
                        [c].[CHARACTER_MAXIMUM_LENGTH], [c].[NUMERIC_PRECISION]
                    ),
                    --CASE WHEN [c].[CHARACTER_MAXIMUM_LENGTH] IS NOT NULL THEN CONCAT(' (', [c].[CHARACTER_MAXIMUM_LENGTH],')' ) END,
                    ') = NULL'
                ),
                ', '
            ) [KeyColCommaParam],
        STRING_AGG(
                CONCAT(
                    'DECLARE @',
                    REPLACE(CONVERT(VARCHAR(MAX), [a].[COLUMN_NAME]), ' ', '_'),
                    '_local ',
                    [c].[DATA_TYPE],
                    CASE
                         WHEN [c].[DATA_TYPE] IN ( 'DECIMAL', 'NUMERIC' ) THEN
                             CONCAT('(', [c].[NUMERIC_PRECISION], ', ', [c].[NUMERIC_SCALE], ')')
                         WHEN [c].[CHARACTER_MAXIMUM_LENGTH] IS NOT NULL THEN
                             CONCAT(' (', [c].[CHARACTER_MAXIMUM_LENGTH], ')')
                    END
                ),
                '; '
            ) [KeyColDeclareLocal],
        STRING_AGG(
                CONCAT(
                    '@',
                    REPLACE(CONVERT(VARCHAR(MAX), [a].[COLUMN_NAME]), ' ', '_'),
                    '_local = NULLIF(@',
                    REPLACE(CONVERT(VARCHAR(MAX), [a].[COLUMN_NAME]), ' ', '_'),
                    ', '''')'
                ),
                ', '
            ) [KeyColSelectLocal],
        STRING_AGG(
                CONCAT(
                    '@', REPLACE(CONVERT(VARCHAR(MAX), [a].[COLUMN_NAME]), ' ', '_'), ' = '''''
                ),
                ', '
            ) [KeyColCommaParamEmptyString]
    FROM
        [INFORMATION_SCHEMA].[KEY_COLUMN_USAGE]   [a]
        INNER JOIN [INFORMATION_SCHEMA].[COLUMNS] [c]
        ON [c].[TABLE_SCHEMA]     = [a].[TABLE_SCHEMA]
            AND [c].[TABLE_NAME]  = [a].[TABLE_NAME]
            AND [c].[COLUMN_NAME] = [a].[COLUMN_NAME]
    GROUP BY
            [a].[TABLE_SCHEMA],
            [a].[TABLE_NAME]
    )                             [k]
    ON [k].[TABLE_SCHEMA]    = [t].[TABLE_SCHEMA]
        AND [k].[TABLE_NAME] = [t].[TABLE_NAME]
WHERE
    [t].[TABLE_TYPE] = 'BASE TABLE'
    AND [t].[TABLE_NAME] LIKE @table_filter
ORDER BY [t].[TABLE_NAME];
 
 
-- UPDATE
SELECT
    CONCAT(
        @useAndSets,
        ' CREATE OR ALTER PROCEDURE ',
        'crd.',
        REPLACE([t].[TABLE_NAME], 'tbl', 'sp'),
        '_update',
        ' (@user_id VARCHAR(20), ',
        CONVERT(VARCHAR(MAX), [AllColCommaParam]),
        ') AS BEGIN ',
        CONCAT(
            '\r\n    /************************************************\r\n    Procedure Name: ',
            'crd.',
            REPLACE([t].[TABLE_NAME], 'tbl', 'sp'),
            '_update',
            '\r\n            Author: Douglas Bowerman\r\n       Create Date: ',
            CONVERT(VARCHAR(30), GETDATE(), 101),
            '\r\n           Purpose: \r\n\r\n    Params:\r\n',
            '        @user_id                   = myId of the user calling the proc (for logging purposes)\r\n',
            [ParamLinesWDesc],
            '\r\n\r\n    Notes:\r\n        @user_id is required.\r\n\r\n    Revised | Author  | Notes\r\n\r\n    ************************************************/'
        ),
        @ncAndLog,
        CONVERT(VARCHAR(MAX), [AllColDeclareLocal]),
        '; ',
        [AllColSetLocal],
        '; UPDATE  ',
        [t].[TABLE_SCHEMA],
        '.',
        [t].[TABLE_NAME],
        ' SET ',
        CONVERT(VARCHAR(MAX), [c].[AllColInsertLocalValues]),
        ' WHERE ',
        [KeyColAndWhere],
        '; SELECT * FROM ',
        [t].[TABLE_SCHEMA],
        '.',
        [t].[TABLE_NAME],
        ' WHERE ',
        [KeyColAndWhere],
        '; END; \r\nGO\r\n'
    ) AS [UpdateScript]
FROM
    [INFORMATION_SCHEMA].[TABLES] [t]
    INNER JOIN (
        SELECT
        [c1].[TABLE_SCHEMA],
        [c1].[TABLE_NAME],
        STRING_AGG(
                CASE
                     WHEN [c1].[COLUMN_NAME] IN (
                         'created_date', 'created_by', 'updated_date', 'updated_by'
                     ) THEN NULL
                     ELSE
                         CONCAT(
                             '        @',
                             REPLACE(CONVERT(VARCHAR(MAX), [c1].[COLUMN_NAME]), ' ', '_'),
                             REPLICATE(' ', 25 - LEN([c1].[COLUMN_NAME])),
                             '= represents the ',
                             REPLACE(CONVERT(VARCHAR(MAX), [c1].[COLUMN_NAME]), ' ', '_'),
                             ' to update records'
                         )
                END,
                '\r\n'
            )                                                           [ParamLinesWDesc],
        STRING_AGG(CONVERT(VARCHAR(MAX), [c1].[COLUMN_NAME]), ', ') [AllColInsertCols],
        STRING_AGG(
                CASE
                     WHEN [c1].[COLUMN_NAME] IN ( 'updated_date' ) THEN
                         CONCAT(
                             CONVERT(VARCHAR(MAX), [c1].[COLUMN_NAME]),
                             ' = GETDATE()'
                         )
                     WHEN [c1].[COLUMN_NAME] IN ( 'updated_by' ) THEN
                         CONCAT(
                             CONVERT(VARCHAR(MAX), [c1].[COLUMN_NAME]),
                             ' = @user_id'
                         )
                     WHEN [c1].[COLUMN_NAME] IN ( 'created_date', 'created_by' ) OR [k].[COLUMN_NAME] IS NOT NULL THEN NULL
                     ELSE
                         CONCAT('[',
                             CONVERT(VARCHAR(MAX), [c1].[COLUMN_NAME]),
                             '] = ISNULL(',
                             '@',
                             REPLACE(CONVERT(VARCHAR(MAX), [c1].[COLUMN_NAME]), ' ', '_'),
                             '_local, [',
                             CONVERT(VARCHAR(MAX), [c1].[COLUMN_NAME]),
                             '])'
                         )
                END,
                ', '
            )                                                           [AllColInsertLocalValues],
        STRING_AGG(
                CASE
                     WHEN [c1].[COLUMN_NAME] IN (
                         'created_date', 'created_by', 'updated_date', 'updated_by'
                     ) THEN NULL
                     ELSE
                         CONCAT(
                             '@',
                             REPLACE(CONVERT(VARCHAR(MAX), [c1].[COLUMN_NAME]), ' ', '_'),
                             ' ',
                             CASE
                                  WHEN [c1].[DATA_TYPE] IN (
                                      'TINYINT', 'SMALLINT', 'INT', 'BIGINT',
                                      'DECIMAL', 'NUMERIC', 'DATETIME', 'UNIQUEIDENTIFIER'
                                  ) THEN 'VARCHAR '
                                  ELSE [c1].[DATA_TYPE]
                             END,
                             CASE WHEN [c1].[DATA_TYPE] = 'BIT' THEN ''
                             ELSE CONCAT('(',
                                ISNULL(
                                    CONVERT(
                                        VARCHAR(50),
                                        NULLIF(COALESCE(
                                                    [c1].[CHARACTER_MAXIMUM_LENGTH],
                                                    [c1].[NUMERIC_PRECISION],
                                                    50
                                                ), -1)
                                    ),
                                    'MAX'
                                ), ') = NULL') END
                         )
                END,
                ', '
            )                                                           [AllColCommaParam],
        STRING_AGG(
                CASE
                     WHEN [c1].[COLUMN_NAME] IN (
                         'created_date', 'created_by', 'updated_date', 'updated_by'
                     ) THEN NULL
                     ELSE
                         CONCAT(
                             'DECLARE @',
                             REPLACE(CONVERT(VARCHAR(MAX), [c1].[COLUMN_NAME]), ' ', '_'),
                             '_local ',
                             CASE
                                  WHEN [c1].[DATA_TYPE] IN (
                                      'TINYINT', 'SMALLINT', 'INT', 'BIGINT',
                                      'DECIMAL', 'NUMERIC'
                                  ) THEN
                                      CONCAT(
                                          [c1].[DATA_TYPE],
                                          CASE
                                               WHEN [c1].[DATA_TYPE] IN ( 'DECIMAL', 'NUMERIC' ) THEN
                                                   CONCAT(
                                                       '(',
                                                       [c1].[NUMERIC_PRECISION],
                                                       ', ',
                                                       [c1].[NUMERIC_SCALE],
                                                       ')'
                                                   )
                                               ELSE ''
                                          END
                                      )
                                  WHEN [c1].[DATA_TYPE] IN ( 'DATETIME',
                                                        'UNIQUEIDENTIFIER',
                                                        'BIT'
                                  ) THEN
                                          [c1].[DATA_TYPE]
                                  ELSE
                                          CONCAT([c1].[DATA_TYPE], '(',
                             ISNULL(
                                 CONVERT(
                                     VARCHAR(50),
                                     NULLIF(COALESCE(
                                                [c1].[CHARACTER_MAXIMUM_LENGTH],
                                                [c1].[NUMERIC_PRECISION],
                                                50
                                            ), -1)
                                 ),
                                 'MAX'
                             ), ')')
                             END
                         )
                END,
                '; '
            )                                                           [AllColDeclareLocal],
        STRING_AGG(
                CASE
                     WHEN [c1].[COLUMN_NAME] IN (
                         'created_date', 'created_by', 'updated_date', 'updated_by'
                     ) THEN NULL
                     ELSE
                         CONCAT(
                             'SET @',
                             REPLACE(CONVERT(VARCHAR(MAX), [c1].[COLUMN_NAME]), ' ', '_'),
                             CASE
                                  WHEN [c1].[DATA_TYPE] IN (
                                      'TINYINT', 'SMALLINT', 'INT', 'BIGINT',
                                      'DECIMAL', 'NUMERIC'
                                  ) THEN
                                      CONCAT(
                                          '_local = TRY_PARSE(NULLIF(@',
                                          REPLACE(CONVERT(VARCHAR(MAX), [c1].[COLUMN_NAME]), ' ', '_'),
                                          ', '''') AS ',
                                          [c1].[DATA_TYPE],
                                          CASE
                                               WHEN [c1].[DATA_TYPE] IN ( 'DECIMAL', 'NUMERIC' ) THEN
                                                   CONCAT(
                                                       '(',
                                                       [c1].[NUMERIC_PRECISION],
                                                       ', ',
                                                       [c1].[NUMERIC_SCALE],
                                                       ')'
                                                   )
                                               ELSE ''
                                          END,
                                          ')'
                                      )
                                  WHEN [c1].[DATA_TYPE] IN ( 'DATETIME',
                                                        'UNIQUEIDENTIFIER'
                                  ) THEN
                                      CONCAT(
                                          '_local = CONVERT(',
                                          [c1].[DATA_TYPE],
                                          ', NULLIF(@',
                                          REPLACE(CONVERT(VARCHAR(MAX), [c1].[COLUMN_NAME]), ' ', '_'),
                                          ', ''''))'
                                      )
                                  ELSE
                                      CONCAT(
                                          '_local = NULLIF(@',
                                          REPLACE(CONVERT(VARCHAR(MAX), [c1].[COLUMN_NAME]), ' ', '_'),
                                          ', '''')'
                                      )
                             END
                         )
                END,
                '; '
            )                                                           [AllColSetLocal]
    FROM
        [INFORMATION_SCHEMA].[COLUMNS] [c1]
        LEFT OUTER JOIN [INFORMATION_SCHEMA].[KEY_COLUMN_USAGE]   [k]
        ON [c1].[TABLE_SCHEMA]     = [k].[TABLE_SCHEMA]
            AND [c1].[TABLE_NAME]  = [k].[TABLE_NAME]
            AND [c1].[COLUMN_NAME] = [k].[COLUMN_NAME]
    GROUP BY
            [c1].[TABLE_SCHEMA],
            [c1].[TABLE_NAME]
    )                             [c]
    ON [c].[TABLE_SCHEMA]    = [t].[TABLE_SCHEMA]
        AND [c].[TABLE_NAME] = [t].[TABLE_NAME]
    LEFT OUTER JOIN (
        SELECT
        [a].[TABLE_SCHEMA],
        [a].[TABLE_NAME],
        STRING_AGG(
            CONCAT(
                '([',
                CONVERT(VARCHAR(MAX), [a].[COLUMN_NAME]),
                '] = ',
                '@',
                REPLACE(CONVERT(VARCHAR(MAX), [a].[COLUMN_NAME]), ' ', '_'),
                '_local)'
                -- ' OR @',
                -- REPLACE(CONVERT(VARCHAR(MAX), [a].[COLUMN_NAME]), ' ', '_'),
                -- '_local IS NULL)'
            ),
            ' AND '
        ) [KeyColAndWhere],
        STRING_AGG(
                CONCAT(
                    '@',
                    REPLACE(CONVERT(VARCHAR(MAX), [a].[COLUMN_NAME]), ' ', '_'),
                    ' ',
                    CASE
                         WHEN [c].[DATA_TYPE] IN (
                             'TINYINT', 'SMALLINT', 'INT', 'BIGINT', 'DECIMAL', 'NUMERIC',
                             'UNIQUEIDENTIFIER'
                         ) THEN 'VARCHAR '
                         ELSE [c].[DATA_TYPE]
                    END,
                    '(',
                    COALESCE(
                        [c].[CHARACTER_MAXIMUM_LENGTH], [c].[NUMERIC_PRECISION]
                    ),
                    --CASE WHEN [c].[CHARACTER_MAXIMUM_LENGTH] IS NOT NULL THEN CONCAT(' (', [c].[CHARACTER_MAXIMUM_LENGTH],')' ) END,
                    ') = NULL'
                ),
                ', '
            ) [KeyColCommaParam],
        STRING_AGG(
                CONCAT(
                    'DECLARE @',
                    REPLACE(CONVERT(VARCHAR(MAX), [a].[COLUMN_NAME]), ' ', '_'),
                    '_local ',
                    [c].[DATA_TYPE],
                    CASE
                         WHEN [c].[DATA_TYPE] IN ( 'DECIMAL', 'NUMERIC' ) THEN
                             CONCAT('(', [c].[NUMERIC_PRECISION], ', ', [c].[NUMERIC_SCALE], ')')
                         WHEN [c].[CHARACTER_MAXIMUM_LENGTH] IS NOT NULL THEN
                             CONCAT(' (', [c].[CHARACTER_MAXIMUM_LENGTH], ')')
                    END
                ),
                '; '
            ) [KeyColDeclareLocal],
        STRING_AGG(
                CONCAT(
                    '@',
                    REPLACE(CONVERT(VARCHAR(MAX), [a].[COLUMN_NAME]), ' ', '_'),
                    '_local = NULLIF(@',
                    REPLACE(CONVERT(VARCHAR(MAX), [a].[COLUMN_NAME]), ' ', '_'),
                    ', '''')'
                ),
                ', '
            ) [KeyColSelectLocal],
        STRING_AGG(
                CONCAT(
                    '@', REPLACE(CONVERT(VARCHAR(MAX), [a].[COLUMN_NAME]), ' ', '_'), ' = '''''
                ),
                ', '
            ) [KeyColCommaParamEmptyString]
    FROM
        [INFORMATION_SCHEMA].[KEY_COLUMN_USAGE]   [a]
        INNER JOIN [INFORMATION_SCHEMA].[COLUMNS] [c]
        ON [c].[TABLE_SCHEMA]     = [a].[TABLE_SCHEMA]
            AND [c].[TABLE_NAME]  = [a].[TABLE_NAME]
            AND [c].[COLUMN_NAME] = [a].[COLUMN_NAME]
    GROUP BY
            [a].[TABLE_SCHEMA],
            [a].[TABLE_NAME]
    )                             [k]
    ON [k].[TABLE_SCHEMA]    = [t].[TABLE_SCHEMA]
        AND [k].[TABLE_NAME] = [t].[TABLE_NAME]
WHERE
    [t].[TABLE_TYPE] = 'BASE TABLE'
    AND [t].[TABLE_NAME] LIKE @table_filter
ORDER BY [t].[TABLE_NAME];
 
-- SELECT
SELECT
    CONCAT(
        @useAndSets,
        'CREATE OR ALTER PROCEDURE crd.',
        REPLACE([t].[TABLE_NAME], 'tbl', 'sp'),
                             '_select',
        ' (@user_id VARCHAR(20), ',
        [KeyColCommaParam],
        ') AS BEGIN ',
        CONCAT(
            '\r\n    /************************************************\r\n    Procedure Name: ',
            'crd.',
            REPLACE([t].[TABLE_NAME], 'tbl', 'sp'),
            '_select',
            '\r\n            Author: Douglas Bowerman\r\n       Create Date: ',
            CONVERT(VARCHAR(30), GETDATE(), 101),
            '\r\n           Purpose: \r\n\r\n    Params:\r\n',
            '        @user_id                   = myId of the user calling the proc (for logging purposes)\r\n',
            [ParamLinesWDesc],
            '\r\n\r\n    Notes:\r\n        @user_id is required.\r\n\r\n    Revised | Author  | Notes\r\n\r\n    ************************************************/'
        ),
        @ncAndLog,
        [k].[KeyColDeclareLocal],
        '; ',
        [k].[KeyColSelectLocal],
        '; SELECT * FROM ',
        [t].[TABLE_SCHEMA],
        '.',
        [t].[TABLE_NAME],
        CASE
             WHEN [k].[KeyColAndWhere] IS NULL THEN ''
             ELSE CONCAT(' WHERE ', [k].[KeyColAndWhere])
        END,
        ' END; \r\nGO\r\n'
    ) AS [SelScript],
    CONCAT(
        'GO EXECUTE sel.',
        [t].[TABLE_NAME],
        ' @user_id = ''M84423'',',
        [KeyColCommaParamEmptyString],
        '; '
    ) AS [ExecuteScript]
FROM
    [INFORMATION_SCHEMA].[TABLES] [t]
    LEFT OUTER JOIN (
        SELECT
        [a].[TABLE_SCHEMA],
        [a].[TABLE_NAME],
        STRING_AGG(
                CONCAT(
                    '        @',
                    REPLACE([a].[COLUMN_NAME], ' ', '_'),
                    REPLICATE(' ', 25 - LEN([a].[COLUMN_NAME])),
                    '= represents the ',
                    [a].[COLUMN_NAME],
                    ' to select records'
                ),
                '\r\n'
            )                                                           [ParamLinesWDesc],
        STRING_AGG(
                CONCAT(
                    '([',
                    [a].[COLUMN_NAME],
                    '] = ',
                    '@',
                    REPLACE([a].[COLUMN_NAME], ' ', '_'),
                    '_local OR ',
                    '@',
                    REPLACE([a].[COLUMN_NAME], ' ', '_'),
                    '_local IS NULL)'
                ),
                ' AND '
            )                                                           [KeyColAndWhere],
        STRING_AGG(
                CONCAT(
                    '@',
                    REPLACE([a].[COLUMN_NAME], ' ', '_'),
                    ' ',
                    CASE
                         WHEN [c].[DATA_TYPE] IN (
                             'TINYINT', 'SMALLINT', 'INT', 'BIGINT', 'DECIMAL', 'NUMERIC',
                             'UNIQUEIDENTIFIER'
                         ) THEN 'VARCHAR '
                         ELSE [c].[DATA_TYPE]
                    END,
                    '(',
                    ISNULL(
                        CONVERT(
                            VARCHAR(50),
                            NULLIF(COALESCE(
                                       [CHARACTER_MAXIMUM_LENGTH],
                                       [NUMERIC_PRECISION],
                                       50
                                   ), -1)
                        ),
                        'MAX'
                    ),
                    --CASE WHEN [c].[CHARACTER_MAXIMUM_LENGTH] IS NOT NULL THEN CONCAT(' (', [c].[CHARACTER_MAXIMUM_LENGTH],')' ) END,
                    ') = NULL'
                ),
                ', '
            )                                                           [KeyColCommaParam],
        STRING_AGG(
                CONCAT(
                    'DECLARE @',
                    REPLACE([a].[COLUMN_NAME], ' ', '_'),
                    '_local ',
                    [c].[DATA_TYPE],
                    CASE
                         WHEN [c].[DATA_TYPE] IN ( 'DECIMAL', 'NUMERIC' ) THEN
                             CONCAT('(', [c].[NUMERIC_PRECISION], ', ', [c].[NUMERIC_SCALE], ')')
                         WHEN [c].[CHARACTER_MAXIMUM_LENGTH] IS NOT NULL THEN
                             CONCAT(' (', [c].[CHARACTER_MAXIMUM_LENGTH], ')')
                    END
                ),
                '; '
            )                                                           [KeyColDeclareLocal],
        STRING_AGG(
                CONCAT(
                    'SET @',
                    REPLACE(CONVERT(VARCHAR(MAX), [a].[COLUMN_NAME]), ' ', '_'),
                    CASE
                         WHEN [DATA_TYPE] IN (
                             'TINYINT', 'SMALLINT', 'INT', 'BIGINT', 'DECIMAL', 'NUMERIC'
                         ) THEN
                             CONCAT(
                                 '_local = TRY_PARSE(NULLIF(@',
                                 REPLACE(CONVERT(VARCHAR(MAX), [a].[COLUMN_NAME]), ' ', '_'),
                                 ', '''') AS ',
                                 [DATA_TYPE],
                                 CASE
                                      WHEN [DATA_TYPE] IN ( 'DECIMAL', 'NUMERIC' ) THEN
                                          CONCAT(
                                              '(',
                                              [NUMERIC_PRECISION],
                                              ', ',
                                              [NUMERIC_SCALE],
                                              ')'
                                          )
                                      ELSE ''
                                 END,
                                 ')'
                             )
                         WHEN [DATA_TYPE] IN ( 'DATETIME', 'UNIQUEIDENTIFIER' ) THEN
                             CONCAT(
                                 '_local = CONVERT(',
                                 [DATA_TYPE],
                                 ', NULLIF(@',
                                 REPLACE(CONVERT(VARCHAR(MAX), [a].[COLUMN_NAME]), ' ', '_'),
                                 ', ''''))'
                             )
                         ELSE
                             CONCAT(
                                 '_local = NULLIF(@',
                                 REPLACE(CONVERT(VARCHAR(MAX), [a].[COLUMN_NAME]), ' ', '_'),
                                 ', '''')'
                             )
                    END
                ),
                '; '
            )                                                           [KeyColSelectLocal],
        STRING_AGG(CONCAT('@', REPLACE([a].[COLUMN_NAME], ' ', '_'), ' = '''''), ', ') [KeyColCommaParamEmptyString]
    FROM
        [INFORMATION_SCHEMA].[KEY_COLUMN_USAGE]   [a]
        INNER JOIN [INFORMATION_SCHEMA].[COLUMNS] [c]
        ON [c].[TABLE_SCHEMA]     = [a].[TABLE_SCHEMA]
            AND [c].[TABLE_NAME]  = [a].[TABLE_NAME]
            AND [c].[COLUMN_NAME] = [a].[COLUMN_NAME]
    GROUP BY
            [a].[TABLE_SCHEMA],
            [a].[TABLE_NAME]
    )                             [k]
    ON [k].[TABLE_SCHEMA]    = [t].[TABLE_SCHEMA]
        AND [k].[TABLE_NAME] = [t].[TABLE_NAME]
WHERE
    [t].[TABLE_TYPE] = 'BASE TABLE'
    AND [t].[TABLE_NAME] LIKE @table_filter
ORDER BY [t].[TABLE_NAME];
 
-- DELETE
SELECT
    CONCAT(
        @useAndSets,
        'CREATE OR ALTER PROCEDURE ',
                             'crd.',
                             REPLACE([t].[TABLE_NAME], 'tbl', 'sp'),
        '_delete',
        ' (@user_id VARCHAR(20), ',
        [KeyColCommaParam],
        ') AS BEGIN ',
        CONCAT(
            '\r\n    /************************************************\r\n    Procedure Name: ',
            'crd.',
            REPLACE([t].[TABLE_NAME], 'tbl', 'sp'),
            '_delete',
            '\r\n            Author: Douglas Bowerman\r\n       Create Date: ',
            CONVERT(VARCHAR(30), GETDATE(), 101),
            '\r\n           Purpose: \r\n\r\n    Params:\r\n',
            '        @user_id                   = myId of the user calling the proc (for logging purposes)\r\n',
            [ParamLinesWDesc],
            '\r\n\r\n    Notes:\r\n        @user_id is required.\r\n\r\n    Revised | Author  | Notes\r\n\r\n    ************************************************/'
        ),
        @ncAndLog,
        [k].[KeyColDeclareLocal],
        '; ',
        [k].[KeyColSelectLocal],
        '; DELETE FROM ',
        [t].[TABLE_SCHEMA],
        '.',
        [t].[TABLE_NAME],
        CASE
             WHEN [k].[KeyColAndWhere] IS NULL THEN ''
             ELSE CONCAT(' WHERE ', [k].[KeyColAndWhere])
        END,
        ' END; \r\nGO\r\n'
    ) AS [DeleteScript],
    CONCAT(
        'GO EXECUTE sel.',
        [t].[TABLE_NAME],
        ' @user_id = ''M84423'',',
        [KeyColCommaParamEmptyString],
        '; '
    ) AS [ExecuteScript]
FROM
    [INFORMATION_SCHEMA].[TABLES] [t]
    LEFT OUTER JOIN (
        SELECT
        [a].[TABLE_SCHEMA],
        [a].[TABLE_NAME],
        STRING_AGG(
                CONCAT(
                    '        @',
                    REPLACE([a].[COLUMN_NAME], ' ', '_'),
                    REPLICATE(' ', 25 - LEN([a].[COLUMN_NAME])),
                    '= represents the ',
                    [a].[COLUMN_NAME],
                    ' to delete records'
                ),
                '\r\n'
            )                                                           [ParamLinesWDesc],
        STRING_AGG(
                CONCAT(
                    '([',
                    [a].[COLUMN_NAME],
                    '] = ',
                    '@',
                    REPLACE([a].[COLUMN_NAME], ' ', '_'),
                    '_local)'
                    -- ' OR @',
                    -- REPLACE([a].[COLUMN_NAME], ' ', '_'),
                    -- '_local IS NULL)'
                ),
                ' AND '
            )                                                           [KeyColAndWhere],
        STRING_AGG(
                CONCAT(
                    '@',
                    REPLACE([a].[COLUMN_NAME], ' ', '_'),
                    ' ',
                    CASE
                         WHEN [c].[DATA_TYPE] IN (
                             'TINYINT', 'SMALLINT', 'INT', 'BIGINT', 'DECIMAL', 'NUMERIC',
                             'UNIQUEIDENTIFIER'
                         ) THEN 'VARCHAR '
                         ELSE [c].[DATA_TYPE]
                    END,
                    '(',
                    ISNULL(
                        CONVERT(
                            VARCHAR(50),
                            NULLIF(COALESCE(
                                       [CHARACTER_MAXIMUM_LENGTH],
                                       [NUMERIC_PRECISION],
                                       50
                                   ), -1)
                        ),
                        'MAX'
                    ),
                    --CASE WHEN [c].[CHARACTER_MAXIMUM_LENGTH] IS NOT NULL THEN CONCAT(' (', [c].[CHARACTER_MAXIMUM_LENGTH],')' ) END,
                    ') = NULL'
                ),
                ', '
            )                                                           [KeyColCommaParam],
        STRING_AGG(
                CONCAT(
                    'DECLARE @',
                    REPLACE([a].[COLUMN_NAME], ' ', '_'),
                    '_local ',
                    [c].[DATA_TYPE],
                    CASE
                         WHEN [c].[DATA_TYPE] IN ( 'DECIMAL', 'NUMERIC' ) THEN
                             CONCAT('(', [c].[NUMERIC_PRECISION], ', ', [c].[NUMERIC_SCALE], ')')
                         WHEN [c].[CHARACTER_MAXIMUM_LENGTH] IS NOT NULL THEN
                             CONCAT(' (', [c].[CHARACTER_MAXIMUM_LENGTH], ')')
                    END
                ),
                '; '
            )                                                           [KeyColDeclareLocal],
        STRING_AGG(
                CONCAT(
                    'SET @',
                    REPLACE(CONVERT(VARCHAR(MAX), [a].[COLUMN_NAME]), ' ', '_'),
                    CASE
                         WHEN [DATA_TYPE] IN (
                             'TINYINT', 'SMALLINT', 'INT', 'BIGINT', 'DECIMAL', 'NUMERIC'
                         ) THEN
                             CONCAT(
                                 '_local = TRY_PARSE(NULLIF(@',
                                 REPLACE(CONVERT(VARCHAR(MAX), [a].[COLUMN_NAME]), ' ', '_'),
                                 ', '''') AS ',
                                 [DATA_TYPE],
                                 CASE
                                      WHEN [DATA_TYPE] IN ( 'DECIMAL', 'NUMERIC' ) THEN
                                          CONCAT(
                                              '(',
                                              [NUMERIC_PRECISION],
                                              ', ',
                                              [NUMERIC_SCALE],
                                              ')'
                                          )
                                      ELSE ''
                                 END,
                                 ')'
                             )
                         WHEN [DATA_TYPE] IN ( 'DATETIME', 'UNIQUEIDENTIFIER' ) THEN
                             CONCAT(
                                 '_local = CONVERT(',
                                 [DATA_TYPE],
                                 ', NULLIF(@',
                                 REPLACE(CONVERT(VARCHAR(MAX), [a].[COLUMN_NAME]), ' ', '_'),
                                 ', ''''))'
                             )
                         ELSE
                             CONCAT(
                                 '_local = NULLIF(@',
                                 REPLACE(CONVERT(VARCHAR(MAX), [a].[COLUMN_NAME]), ' ', '_'),
                                 ', '''')'
                             )
                    END
                ),
                '; '
            )                                                           [KeyColSelectLocal],
        STRING_AGG(CONCAT('@', REPLACE([a].[COLUMN_NAME], ' ', '_'), ' = '''''), ', ') [KeyColCommaParamEmptyString]
    FROM
        [INFORMATION_SCHEMA].[KEY_COLUMN_USAGE]   [a]
        INNER JOIN [INFORMATION_SCHEMA].[COLUMNS] [c]
        ON [c].[TABLE_SCHEMA]     = [a].[TABLE_SCHEMA]
            AND [c].[TABLE_NAME]  = [a].[TABLE_NAME]
            AND [c].[COLUMN_NAME] = [a].[COLUMN_NAME]
    GROUP BY
            [a].[TABLE_SCHEMA],
            [a].[TABLE_NAME]
    )                             [k]
    ON [k].[TABLE_SCHEMA]    = [t].[TABLE_SCHEMA]
        AND [k].[TABLE_NAME] = [t].[TABLE_NAME]
WHERE
    [t].[TABLE_TYPE] = 'BASE TABLE'
    AND [t].[TABLE_NAME] LIKE @table_filter
ORDER BY [t].[TABLE_NAME];