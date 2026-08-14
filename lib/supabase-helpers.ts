/**
 * Helper to fetch all rows from a Supabase table bypassing the default 1000-row PostgREST limit.
 */
export async function fetchAllRows<T = any>(
  supabase: any,
  tableName: string,
  selectQuery: string = '*',
  filterFn?: (query: any) => any
): Promise<T[]> {
  let allRows: T[] = [];
  let page = 0;
  const pageSize = 1000;
  const maxPages = 30; // Safety guard against infinite loops

  try {
    while (page < maxPages) {
      let query = supabase.from(tableName).select(selectQuery);
      if (filterFn) {
        query = filterFn(query);
      }
      const { data, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);

      if (error || !data || data.length === 0) {
        if (error) {
          console.error(`Error in fetchAllRows for table ${tableName}:`, error);
        }
        break;
      }

      allRows = allRows.concat(data);
      if (data.length < pageSize) break;
      page++;
    }
  } catch (err) {
    console.error(`Exception in fetchAllRows for table ${tableName}:`, err);
  }

  return allRows;
}

/**
 * Paginated variant for administrative workflows where returning a partial or
 * empty dataset would be misleading. Database failures are surfaced to the
 * caller instead of being logged and swallowed.
 */
export async function fetchAllRowsStrict<T = any>(
  supabase: any,
  tableName: string,
  selectQuery: string = '*',
  filterFn?: (query: any) => any
): Promise<T[]> {
  const allRows: T[] = [];
  const pageSize = 1000;
  const maxPages = 30;

  for (let page = 0; page < maxPages; page++) {
    let query = supabase.from(tableName).select(selectQuery);
    if (filterFn) query = filterFn(query);

    const { data, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw new Error(`Error al consultar ${tableName}: ${error.message}`);
    if (!data || data.length === 0) return allRows;

    allRows.push(...data);
    if (data.length < pageSize) return allRows;
  }

  throw new Error(`La consulta de ${tableName} superó el límite seguro de ${maxPages * pageSize} registros.`);
}
