export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  active: boolean;
};

export type ProductImage = {
  id: string;
  product_id: string;
  url: string;
  alt: string | null;
  sort_order: number;
};

export type Product = {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  sale_price: number | null;
  stock: number;
  active: boolean;
  featured: boolean;
  created_at: string;
  updated_at: string;
  category?: Pick<Category, "name" | "slug"> | null;
  images: ProductImage[];
};

export type InquiryStatus = "contacto" | "vendido" | "no_vendido";

export type Inquiry = {
  id: string;
  product_id: string | null;
  product_name: string;
  customer_name: string | null;
  customer_phone: string | null;
  color_preference: string | null;
  customization: string | null;
  status: InquiryStatus;
  sale_amount: number | null;
  sold_at: string | null;
  created_at: string;
};
