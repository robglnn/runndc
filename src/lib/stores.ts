import { writable } from 'svelte/store'

export interface AppError {
  title: string
  message: string
  details?: string | string[]
}

const errorStore = writable<AppError | null>(null)

export const errors = {
  subscribe: errorStore.subscribe,
  show(error: AppError) {
    errorStore.set(error)
  },
  clear() {
    errorStore.set(null)
  }
}

