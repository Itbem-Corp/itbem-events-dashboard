export type GuestListSortColumn = 'name' | 'status' | 'table' | 'guests_count'

export interface EventDetailGuestsViewState {
  search: string
  status: string
  page: number
  sortColumn: GuestListSortColumn
  sortDirection: 'asc' | 'desc'
}

export const initialEventDetailGuestsViewState: EventDetailGuestsViewState = {
  search: '',
  status: 'ALL',
  page: 1,
  sortColumn: 'name',
  sortDirection: 'asc',
}
