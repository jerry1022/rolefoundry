// Stable seed identifiers shared by demo and production modules.
export const tracks = [
  "Engineering & data",
  "Product & strategy",
  "Marketing & operations",
  "Design & content",
] as const;
export type Track = (typeof tracks)[number];
export type Skill =
  | "python"
  | "sql"
  | "prompting"
  | "rag"
  | "evaluation"
  | "agents"
  | "product"
  | "automation"
  | "content";
export const skillLabels: Record<Skill, string> = {
  python: "Python",
  sql: "SQL",
  prompting: "Prompt design",
  rag: "RAG & retrieval",
  evaluation: "AI evaluation",
  agents: "Agent workflows",
  product: "Product thinking",
  automation: "Automation",
  content: "Content design",
};
