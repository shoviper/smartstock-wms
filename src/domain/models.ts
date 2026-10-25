export type Role = 'PICKER' | 'RECEIVER' | 'MANAGER' | 'ADMIN';

export type StockStatus = 'OUT' | 'CRITICAL' | 'LOW' | 'NORMAL';

export type MovementType = 'RECEIVE' | 'PICK' | 'ADJUST';

export type OrderStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'COMPLETED_WITH_SHORTAGE';

export type OrderPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type Theme = 'light' | 'dark';

export interface Product {
  sku: string;
  name: string;
  category: string;
  unit: string;
  locationId: string;
  onHand: number;
  reorderPoint: number;
  leadTimeDays: number;
}

export interface Location {
  id: string;
  zone: string;
  aisle: string;
  rack: string;
  level: number;
  capacity: number;
  coordinates: { x: number; y: number };
  dispatchDistanceMeters: number;
}

export interface OrderLine {
  sku: string;
  qty: number;
  pickedQty: number;
  shortQty?: number;
  shortReason?: string;
}

export interface Order {
  id: string;
  customer: string;
  createdAt: string;
  dueAt: string;
  priority: OrderPriority;
  status: OrderStatus;
  lines: OrderLine[];
  startedAt?: string | null;
  assignedTo?: string | null;
  shortageReason?: string;
  completedAt?: string | null;
}

export interface Movement {
  id: string;
  timestamp: string;
  type: MovementType;
  sku: string;
  qty: number;
  qtyBefore: number;
  qtyAfter: number;
  locationId: string;
  userId: string;
  reference: string | null;
  reason: string;
}

export interface User {
  id: string;
  name: string;
  role: Role;
}

export interface BusinessData {
  products: Record<string, Product>;
  locations: Record<string, Location>;
  orders: Record<string, Order>;
  movements: Movement[];
  users: Record<string, User>;
}

export interface StoreFeedback {
  kind: 'success' | 'error';
  message: string;
}

export interface StoreState extends BusinessData {
  currentUserId: string | null;
  session: User | null;
  theme: Theme;
  settings: AppSettings;
  feedback: StoreFeedback | null;
}

export interface AppSettings {
  defaultReorderPoint: number;
}
