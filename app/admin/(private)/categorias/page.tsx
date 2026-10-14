import Image from "next/image";
import { ImagePlus, Pencil } from "lucide-react";
import { deleteCategory, saveCategory } from "@/app/admin/actions";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { getAdminData } from "@/lib/data/catalog";
import { requireAdmin } from "@/lib/auth/session";

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ edit?: string; deleted?: string }> }) {
  await requireAdmin("business");
  const params = await searchParams;
  const { categories } = await getAdminData();
  const editing = categories.find((category) => category.id === params.edit);
  const nextOrder = categories.length ? Math.max(...categories.map((category) => category.sort_order)) + 10 : 10;

  return <main className="admin-content">
    <div className="admin-title"><div><p className="admin-kicker">Organización</p><h1>Categorías</h1></div></div>
    {params.deleted && <div className="admin-success">Categoría eliminada. La vitrina pública ya quedó actualizada.</div>}
    <section className="category-admin-grid">
      <form action={saveCategory} className="admin-panel category-form">
        <div><p className="admin-kicker">{editing ? "Editar categoría" : "Nueva categoría"}</p><h2>{editing?.name || "Agrupa tus piezas"}</h2></div>
        <input type="hidden" name="id" value={editing?.id || ""} />
        <label>Nombre<input name="name" defaultValue={editing?.name} required /></label>
        <label>Descripción <small>Opcional</small><textarea name="description" rows={4} defaultValue={editing?.description || ""} /></label>
        <label>Posición en la web <small>Un número menor aparece primero. Ejemplo: 10 antes que 20.</small><input type="number" name="sort_order" min="0" step="10" defaultValue={editing?.sort_order ?? nextOrder} /></label>
        <label className="category-cover-upload">
          <span>Imagen de portada</span>
          <small>{editing?.image_url ? "Sube otra para reemplazar la actual" : "Se verá en la categoría de la página principal"}</small>
          {editing?.image_url ? <span className="category-cover-preview"><Image src={editing.image_url} alt={`Portada actual de ${editing.name}`} fill sizes="260px" /></span> : <span className="category-cover-empty"><ImagePlus size={22} /> Elegir imagen</span>}
          <input name="image" type="file" accept="image/jpeg,image/png,image/webp" />
        </label>
        <label className="checkbox-label"><input type="checkbox" name="active" defaultChecked={editing?.active ?? true} /> Categoría visible</label>
        <button className="admin-primary" type="submit">{editing ? "Guardar cambios" : "Crear categoría"}</button>
      </form>
      <div className="admin-panel category-list">
        <div className="panel-heading"><div><p className="admin-kicker">Orden público</p><h2>Categorías actuales</h2></div></div>
        {categories.length ? categories.map((category) => <div className="category-row" key={category.id}>
          {category.image_url ? <span className="category-row-image"><Image src={category.image_url} alt="" fill sizes="46px" /></span> : <span>{String(category.sort_order).padStart(2, "0")}</span>}
          <div><strong>{category.name}</strong><small>{category.description || "Sin descripción"}</small><small>Posición {category.sort_order}</small></div>
          <em>{category.active ? "Visible" : "Oculta"}</em>
          <div className="category-row-actions">
            <a href={`/admin/categorias?edit=${category.id}`} aria-label={`Editar ${category.name}`}><Pencil size={16} /></a>
            <form action={deleteCategory}>
              <input type="hidden" name="id" value={category.id} />
              <input type="hidden" name="confirmation" value={category.name} />
              <ConfirmSubmitButton message={`¿Eliminar “${category.name}”? Solo se borrará si no contiene productos.`} label="" />
            </form>
          </div>
        </div>) : <div className="admin-empty"><p>No hay categorías todavía.</p></div>}
      </div>
    </section>
  </main>;
}
