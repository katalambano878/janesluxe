export default function AdminLoading() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-8 bg-gray-200 rounded-lg w-48" />
      <div className="h-4 bg-gray-100 rounded w-72" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
        <div className="h-28 bg-gray-100 rounded-xl" />
        <div className="h-28 bg-gray-100 rounded-xl" />
        <div className="h-28 bg-gray-100 rounded-xl" />
      </div>
      <div className="h-64 bg-gray-100 rounded-xl mt-4" />
    </div>
  );
}
