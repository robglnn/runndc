<script lang="ts">
  import { onMount } from 'svelte'
  import { browser } from '$app/environment'
  import { errors } from '$lib/stores'
  import type { AppError } from '$lib/stores'
  import { fly } from 'svelte/transition'

  let current: AppError | null = null
  let unsubscribe: (() => void) | null = null
  let cleanupOverflow = false

  function close() {
    errors.clear()
  }

  onMount(() => {
    unsubscribe = errors.subscribe((value) => {
      current = value
      if (browser) {
        if (value && !cleanupOverflow) {
          document.body.style.overflow = 'hidden'
          cleanupOverflow = true
        } else if (!value && cleanupOverflow) {
          document.body.style.overflow = ''
          cleanupOverflow = false
        }
      }
    })

    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
      if (browser) {
        document.body.style.overflow = ''
      }
    }
  })
</script>

{#if current}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 backdrop-blur-sm">
    <div
      class="w-full max-w-lg rounded-3xl bg-amber-50 p-6 shadow-2xl ring-1 ring-amber-200"
      transition:fly={{ y: 12, duration: 150 }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="error-title"
    >
      <div class="flex items-start justify-between gap-4">
        <div class="space-y-2 text-neutral-900">
          <h3 id="error-title" class="text-xl font-semibold">
            {current.title}
          </h3>
          <p class="text-sm text-neutral-700">
            {current.message}
          </p>

          {#if current.details}
            <ul class="mt-3 space-y-2 text-sm text-neutral-600">
              {#if Array.isArray(current.details)}
                {#each current.details as detail}
                  <li class="rounded-lg bg-white px-3 py-2 shadow-sm ring-1 ring-amber-100">
                    {detail}
                  </li>
                {/each}
              {:else}
                <li class="rounded-lg bg-white px-3 py-2 shadow-sm ring-1 ring-amber-100">
                  {current.details}
                </li>
              {/if}
            </ul>
          {/if}
        </div>

        <button
          class="rounded-full border border-amber-400 bg-amber-600 px-3 py-1 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-300"
          on:click={close}
          aria-label="Close error modal"
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}

