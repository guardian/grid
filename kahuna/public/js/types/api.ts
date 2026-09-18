export type Action = {
  name: string;
  href: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
};
