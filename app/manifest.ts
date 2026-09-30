import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest { return { name: "Liira Accesorios", short_name: "Liira", description: "Accesorios de murano hechos a mano", start_url: "/", display: "standalone", background_color: "#f4eadc", theme_color: "#6f0016", icons: [{ src: "/brand/liira-logo.png", sizes: "1080x1080", type: "image/png" }] }; }
