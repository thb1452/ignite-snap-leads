import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { isPublicIndexablePath } from "@/lib/publicRoutes";
import { resetPageMetadata, setMeta } from "@/lib/pageMetadata";

/** Indexing controls complement authentication; they do not provide data security. */
export function RouteMetadataBoundary() {
  const { pathname } = useLocation();
  useEffect(() => {
    const isPublic = isPublicIndexablePath(pathname);
    setMeta("name", "robots", isPublic ? "index, follow" : "noindex, nofollow");
    if (!isPublic) resetPageMetadata();
  }, [pathname]);
  return null;
}
