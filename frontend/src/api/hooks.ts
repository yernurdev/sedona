import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, post } from './client'
import type { CaseInfo, CheckinList, Plan, StateMeta, Summary, TaxPreview, OfferInput, OfferResult } from './types'

export const useCaseInfo = (id: string) => useQuery({ queryKey: ['case', id], queryFn: () => api<CaseInfo>(`/cases/${id}`) })
export const useSummary = (id: string) => useQuery({ queryKey: ['summary', id], queryFn: () => api<Summary>(`/cases/${id}/summary`) })
export const usePlan = (id: string, enabled = true) =>
  useQuery({ queryKey: ['plan', id], queryFn: () => api<Plan>(`/cases/${id}/plan`), enabled, retry: false })
export const useCheckins = (id: string) => useQuery({ queryKey: ['checkins', id], queryFn: () => api<CheckinList>(`/cases/${id}/checkins`), retry: false })
export const useOffers = (id: string) =>
  useQuery({
    queryKey: ['offers', id],
    queryFn: () => api<{ offers: { id: string; input: OfferInput; result: OfferResult; createdAt: string }[] }>(`/cases/${id}/offers`),
    retry: false,
  })
export const useTax = (id: string, withholding: boolean) =>
  useQuery({ queryKey: ['tax', id, withholding], queryFn: () => api<TaxPreview>(`/cases/${id}/tax-preview${withholding ? '?uiWithholding=1' : ''}`), retry: false })
export const useStates = () => useQuery({ queryKey: ['states'], queryFn: () => api<{ states: StateMeta[] }>('/meta/states'), staleTime: Infinity })

export function useAdvance(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => post<{ currentDate: string }>(`/cases/${id}/demo/advance`, { weeks: 1 }),
    onSuccess: () => qc.invalidateQueries(),
  })
}
