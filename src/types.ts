export type TaskStatus = "todo" | "in-progress" | "done";

export type Task = {
  id: string;
  commessa: string;
  description: string;
  client: string;
  hours: number;
  assigneeId?: string;
  startDate?: string;
  endDate?: string;
  status: TaskStatus;
};

export type TodoItem = {
  id: string;
  title: string;
  description?: string;
  client?: string;
  commessa?: string;
  businessUnit?: string;
  resourceId?: string;
  completed: boolean;
  createdAt?: string;
  dueDate?: string;
};

export type Member = {
  id: string;
  name: string;
  role?: string;
  group?: "bi" | "crm";
  annualTarget?: number; // Obiettivo annuo in €
};
