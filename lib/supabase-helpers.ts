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
