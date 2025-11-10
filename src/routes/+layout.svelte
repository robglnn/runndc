<script lang="ts">
  import ErrorModal from '$lib/components/ErrorModal.svelte'
  import '../app.css'

  const { children } = $props()
</script>

<main class="min-h-screen bg-amber-50 text-neutral-900 antialiased">
  {@render children()}
</main>

<footer class="border-t border-amber-100/70 bg-amber-50/90 py-6 text-sm text-neutral-600">
  <div class="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-6 sm:flex-row">
    <span>© 2025 Foundation Health · RUN NDC v1.0</span>
    <a
      href="https://github.com/robglnn/runndc"
      target="_blank"
      rel="noreferrer"
      class="font-medium text-amber-700 transition hover:text-amber-800"
    >
      View on GitHub
    </a>
  </div>
</footer>

<ErrorModal />
