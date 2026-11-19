import { createContext, ReactNode, useContext } from "react"
import { CATEGORIES } from "../types"
import type { Service, ServiceCategory } from "../types"

// Services come from GET /api/services (MariaDB). Screens read them through this context
// so no screen keeps its own hard-coded copy of the price list.

interface CatalogValue {
  services: Service[]
  loading: boolean
  error: string | null
  categoryOf: (serviceId: string | null | undefined) => ServiceCategory | null
  getService: (serviceId: string | null | undefined) => Service | undefined
}

const CatalogContext = createContext<CatalogValue>({
  services: [],
  loading: true,
  error: null,
  categoryOf: () => null,
  getService: () => undefined,
})

export function CatalogProvider({
  services,
  loading,
  error,
  children,
}: {
  services: Service[]
  loading: boolean
  error: string | null
  children: ReactNode
}) {
  const getService = (serviceId: string | null | undefined) =>
    serviceId ? services.find((service) => service.id === serviceId) : undefined
  const categoryOf = (serviceId: string | null | undefined) =>
    getService(serviceId)?.category ?? null
  return (
    <CatalogContext.Provider
      value={{ services, loading, error, categoryOf, getService }}
    >
      {children}
    </CatalogContext.Provider>
  )
}

export function useCatalog() {
  return useContext(CatalogContext)
}

/** Groups services by their database category, in the order the approved UI shows them. */
export function groupServices(
  services: Service[],
): { category: ServiceCategory; ids: string[] }[] {
  return CATEGORIES.map((category) => ({
    category: category.id,
    ids: services
      .filter((service) => service.category === category.id)
      .map((service) => service.id),
  })).filter((group) => group.ids.length > 0)
}
