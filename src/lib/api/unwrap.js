// Shared result handling for supabase-js calls: throw on error, return data.
export function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}
