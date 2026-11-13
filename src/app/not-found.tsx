import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty-state">
      <h1>A different path, perhaps?</h1>
      <p>This page does not exist. Your next possibility is still out there.</p>
      <Link href="/" className="button primary">
        Back to your workspace
      </Link>
    </div>
  );
}
