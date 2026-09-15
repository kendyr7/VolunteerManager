/** Keep React subscribers and search indexes intact when a poll changes nothing.
 * Compare all selected fields, not only timestamps: edits and removals must win.
 */
export function retainEqualSnapshot<T>(previous: T, next: T): T {
  return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
}
