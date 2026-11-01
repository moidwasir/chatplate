export interface Modifier {
  id: string;
  groupId: string;
  name: string;
  nameUrdu: string | null;
  priceAdjustment: number;
  isAvailable: boolean;
  sortOrder: number;
}

export interface ModifierGroup {
  id: string;
  itemId: string;
  name: string;
  nameUrdu: string | null;
  required: boolean;
  minChoices: number;
  maxChoices: number;
  sortOrder: number;
  modifiers: Modifier[];
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  nameUrdu: string | null;
  description: string | null;
  price: number;
  /** Regular price for deals ("save Rs X"), paisa */
  compareAtPrice: number | null;
  imageUrl: string | null;
  isSoldOut: boolean;
  isActive: boolean;
  servingStart: string | null;
  servingEnd: string | null;
  sortOrder: number;
  modifierGroups: ModifierGroup[];
}

export interface Category {
  id: string;
  branchId: string;
  name: string;
  nameUrdu: string | null;
  sortOrder: number;
  isActive: boolean;
  items: MenuItem[];
}
