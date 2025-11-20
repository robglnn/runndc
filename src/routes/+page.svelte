<script lang="ts">
  import { tick } from 'svelte'
  import type { CalcResult } from '$lib/types'
  import { syntheticScenarios, type SyntheticScenario } from '$lib/synthetics'
  import { errors } from '$lib/stores'

  interface ApiResponse {
    success: boolean
    data?: CalcResult
    error?: string
    warnings?: string[]
  }

  let drug = ''
  let sig = ''
  let days = 30

  let loading = false
  let errorMessage: string | null = null
  let result: CalcResult | null = null
  let copySuccess = false
  const demos = syntheticScenarios

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    errorMessage = null
    copySuccess = false
    loading = true

    try {
      const res = await fetch('/api/calc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drug, sig, days: Number(days) })
      })
      const payload = (await res.json()) as ApiResponse

      if (!payload.success || !payload.data) {
        errorMessage = payload.error ?? 'Calculation failed. Please retry.'
        errors.show({
          title: 'Calculation failed',
          message: errorMessage,
          details: payload.warnings
        })
        result = null
        return
      }

      result = payload.data
      await tick()
      document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' })
    } catch (error) {
      console.error(error)
      errorMessage = 'Unexpected error. Check connection and retry.'
      errors.show({
        title: 'Unexpected Error',
        message: errorMessage
      })
      result = null
    } finally {
      loading = false
    }
  }

  async function copyJson() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.json)
      copySuccess = true
      setTimeout(() => {
        copySuccess = false
      }, 2000)
    } catch (error) {
      console.error('copy failed', error)
    }
  }

  $: warnings = result?.warnings ?? []
  $: recommended = result?.ndcs?.[0]
  $: unparsedPackages = result?.unparsedPackages ?? []
  $: drugLabel = result?.drugName ?? null
  $: totalQtyDisplay = result ? formatNumber(result.totalQty) : ''
  $: overfillPercent = result ? (result.overfillPct * 100).toFixed(2) : ''

  function formatNumber(value: number) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
  }

  function applyScenario(scenario: SyntheticScenario) {
    drug = scenario.drug
    sig = scenario.sig
    days = scenario.days
    errorMessage = null
    result = null
    copySuccess = false
    errors.clear()
  }
</script>

<svelte:head>
  <title>NDC Packaging &amp; Quantity Calculator</title>
  <meta
    name="description"
    content="Match prescriptions to valid NDCs, compute dispense quantities, and surface overfill warnings."
  />
</svelte:head>

<section class="flex w-full flex-col bg-amber-50 px-6 py-20">
  <div class="mx-auto flex w-full max-w-6xl flex-col gap-12">
    <div class="grid items-center gap-10 lg:grid-cols-[1.4fr,1fr]">
      <div class="space-y-6">
        <span class="inline-flex rounded-full bg-amber-100 px-4 py-1 text-sm font-medium text-amber-600">
          RUN NDC
        </span>
        <h1 class="text-4xl font-semibold text-neutral-900 sm:text-5xl">
          NDC Packaging &amp; Quantity Calculator
        </h1>
        <p class="max-w-2xl text-lg text-neutral-800">
          Match any prescription to valid NDCs, calculate exact dispense quantities, and flag overfill
          or inactive packages in seconds. Built for pharmacists and pharmacy technicians on tight
          timelines.
        </p>
        <div class="flex flex-wrap items-center gap-4 text-sm text-neutral-700">
          <div class="flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm">
            <span class="h-2 w-2 rounded-full bg-amber-600"></span>
            <span>RxNorm + FDA NDC Directory</span>
          </div>
          <div class="flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm">
            <span class="h-2 w-2 rounded-full bg-neutral-800"></span>
            <span>Overfill warnings &gt;12%</span>
          </div>
        </div>
      </div>

      <form
        class="rounded-3xl bg-white p-8 shadow-xl ring-1 ring-amber-100"
        on:submit={handleSubmit}
        aria-labelledby="calc-form-title"
      >
        <div class="space-y-6">
          <div class="space-y-2">
            <h2 id="calc-form-title" class="text-2xl font-semibold text-neutral-900">
              Fill in the prescription
            </h2>
            <p class="text-sm text-neutral-600">
              Enter a drug name or 10/11-digit NDC, the SIG, and days’ supply. We’ll normalize the rest.
            </p>
          </div>

          <div class="space-y-3">
            <div class="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Try demo scenarios
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              {#each demos as scenario}
                <button
                  type="button"
                  class="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-left text-sm font-medium text-neutral-800 transition hover:border-amber-200 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-200"
                  on:click={() => applyScenario(scenario)}
                >
                  <span>{scenario.label}</span>
                  {#if scenario.note}
                    <span class="text-xs font-normal text-neutral-500">{scenario.note}</span>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
          <div class="space-y-4">
            <div class="space-y-2">
              <label for="drug" class="text-sm font-medium text-neutral-800">
                Drug name or NDC
              </label>
              <input
                id="drug"
                class="w-full rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-base font-medium text-neutral-900 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200"
                placeholder="Ibuprofen 200 mg or 12345-6789-01"
                bind:value={drug}
                required
              />
            </div>

            <div class="space-y-2">
              <label for="sig" class="text-sm font-medium text-neutral-800">
                SIG
              </label>
              <textarea
                id="sig"
                rows={3}
                class="w-full rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-base font-medium text-neutral-900 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200"
                placeholder="1 tablet by mouth twice daily"
                bind:value={sig}
                required
              ></textarea>
            </div>

            <div class="space-y-2">
              <label for="days" class="text-sm font-medium text-neutral-800">
                Days’ supply
              </label>
              <input
                id="days"
                type="number"
                min="1"
                class="w-full rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-base font-medium text-neutral-900 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200"
                bind:value={days}
                required
              />
            </div>
          </div>

          {#if errorMessage}
            <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          {/if}

          <button
            type="submit"
            class="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={loading}
          >
            {#if loading}
              <span class="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent"></span>
              Calculating…
            {:else}
              Calculate
            {/if}
          </button>

          <p class="text-xs text-neutral-500">
            We normalize NDCs to 11-digit format, run RxNorm and FDA lookups, and flag overfill beyond 12%.
          </p>
        </div>
      </form>
    </div>
  </div>
</section>

<section id="results" class="mx-auto w-full max-w-6xl px-6 py-16">
  <div class="space-y-10">
    <header class="space-y-3">
      <h2 class="text-3xl font-semibold text-neutral-900">Results</h2>
      {#if drugLabel}
        <p class="text-lg font-medium text-neutral-800">
          Drug: <span class="text-amber-700">{drugLabel}</span>
        </p>
      {/if}
      <p class="text-neutral-600">
        Recommended NDC packages, calculated quantities, and structured output for your claim or pharmacy
        system.
      </p>
    </header>

    {#if result?.inactiveNdcs && result.inactiveNdcs.length > 0}
      <div class="rounded-3xl border-4 border-red-700 bg-red-600/90 p-6 text-white shadow-lg">
        <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 class="text-2xl font-bold tracking-wide">Inactive NDC Detected</h3>
            <p class="mt-1 text-sm text-red-100">
              Do not dispense these packages. Select an active NDC before proceeding.
            </p>
          </div>
          <div class="flex items-center gap-2 text-sm md:text-base">
            <span class="rounded-full bg-white/20 px-3 py-1 font-semibold uppercase">
              {result.inactiveNdcs.length} flagged
            </span>
          </div>
        </div>
        <ul class="mt-4 space-y-2 text-sm md:text-base">
          {#each result.inactiveNdcs as inactive}
            <li class="rounded-2xl bg-white/15 px-4 py-3 font-medium">
              <span class="text-white">{inactive.ndc}</span>
              {#if inactive.expiry}
                <span class="ml-2 text-red-200">(expired {inactive.expiry})</span>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if result}
      <div class="grid gap-6 lg:grid-cols-4">
        <article class="rounded-3xl bg-white p-6 shadow-lg ring-1 ring-amber-100">
          <div class="text-sm font-semibold uppercase tracking-wide text-amber-600">Total quantity</div>
          <div class="mt-4 text-4xl font-semibold text-neutral-900">{totalQtyDisplay}</div>
          <p class="mt-3 text-sm text-neutral-600">
            Days supply × parsed SIG
          </p>
        </article>

        <article class="rounded-3xl bg-white p-6 shadow-lg ring-1 ring-amber-100 lg:col-span-2">
          <div class="flex items-center justify-between text-sm font-semibold uppercase tracking-wide text-amber-600">
            <span>Recommended NDC</span>
            {#if overfillPercent}
              <span class="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-700">
                Overfill {overfillPercent}%
              </span>
            {/if}
          </div>
          {#if recommended}
            <div class="mt-4 space-y-3">
              <a
                class="text-2xl font-semibold text-neutral-900 underline decoration-amber-300 decoration-2 underline-offset-4"
                href={`https://www.aapc.com/codes/ndc-lookup/${recommended.formattedNdc}`}
                rel="noreferrer"
                target="_blank"
              >
                {recommended.formattedNdc}
              </a>
              <p class="text-sm text-neutral-600">
                {recommended.description || 'Package details unavailable'} · {recommended.size}{' '}
                {recommended.unit} × {recommended.packs} pack{recommended.packs === 1 ? '' : 's'}
              </p>
              <p class="text-xs text-neutral-500">
                Dispensed quantity {formatNumber(recommended.dispensedQty)} (inactive?{' '}
                {recommended.inactive ? 'Yes' : 'No'})
              </p>
            </div>
            {#if result.aiSuggestion}
              <div class="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-neutral-800">
                <div class="flex items-start gap-3">
                  <div class="font-semibold text-amber-700">AI suggestion</div>
                  <p class="leading-relaxed">{result.aiSuggestion.rationale}</p>
                </div>
                <p class="mt-2 text-xs text-neutral-600">
                  Verify before dispensing. Suggested product NDC: {result.aiSuggestion.productNdc}
                </p>
              </div>
            {/if}
          {:else}
            <p class="mt-4 text-sm text-neutral-600">
              No packages matched this calculation. Verify RxCUI or NDC input.
            </p>
          {/if}
        </article>

        <article class="rounded-3xl bg-white p-6 shadow-lg ring-1 ring-amber-100 min-h-[220px]">
          <div class="text-sm font-semibold uppercase tracking-wide text-amber-600">ADDTL INFO</div>
          {#if warnings.length > 0}
            <ul class="mt-4 space-y-3 text-sm text-red-700">
              {#each warnings as warning}
                <li class="rounded-lg bg-red-50 px-4 py-3 leading-relaxed">{warning}</li>
              {/each}
            </ul>
          {:else}
            <p class="mt-4 text-sm text-neutral-600">No warnings. You’re clear to proceed.</p>
          {/if}
        </article>
      </div>

      {#if result?.ndcs?.length}
        <article class="rounded-3xl bg-white p-6 shadow-lg ring-1 ring-amber-100">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-neutral-900">Available NDC Packages</h3>
            <span class="text-sm text-neutral-500">{result.ndcs.length} option{result.ndcs.length === 1 ? '' : 's'}</span>
          </div>
          <div class="mt-4 divide-y divide-amber-100 border border-amber-100 rounded-2xl">
            {#each result.ndcs as ndc, index}
              <div class="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div class="space-y-1">
                  <div class="flex items-center gap-2">
                    <a
                      class="text-base font-semibold text-neutral-900 underline decoration-amber-300 decoration-2 underline-offset-4"
                      href={`https://www.aapc.com/codes/ndc-lookup/${ndc.formattedNdc}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {ndc.formattedNdc}
                    </a>
                    {#if index === 0}
                      <span class="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                        Recommended
                      </span>
                    {/if}
                    {#if ndc.inactive}
                      <span class="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                        Inactive
                      </span>
                    {/if}
                  </div>
                  <div class="text-sm text-neutral-600">
                    {ndc.description || ndc.packageDescription || 'Package details unavailable'}
                  </div>
                  {#if ndc.labelerName}
                    <div class="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      {ndc.labelerName}
                    </div>
                  {/if}
                </div>
                <div class="flex flex-wrap gap-3 text-sm text-neutral-700 sm:text-right">
                  <span class="rounded-full bg-amber-50 px-3 py-1">
                    Size: {formatNumber(ndc.size)} {ndc.unit}{ndc.size === 1 ? '' : 's'}
                  </span>
                  <span class="rounded-full bg-amber-50 px-3 py-1">
                    Packs: {ndc.packs}
                  </span>
                  <span class="rounded-full bg-amber-50 px-3 py-1">
                    Dispensed: {formatNumber(ndc.dispensedQty)}
                  </span>
                  <span class="rounded-full bg-amber-50 px-3 py-1">
                    Overfill: {(ndc.overfillPct * 100).toFixed(2)}%
                  </span>
                </div>
              </div>
            {/each}
          </div>
        </article>
      {/if}

      {#if unparsedPackages.length > 0}
        <article class="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-neutral-800 shadow-sm">
          <h3 class="text-lg font-semibold text-neutral-900">Unparsed FDA Packages (manual review)</h3>
          <p class="mt-2 text-sm text-neutral-600">
            FDA returned package data with unsupported units. Review the descriptions below or try searching by
            drug name to locate a better fitting NDC.
          </p>
          <div class="mt-4 divide-y divide-amber-200 rounded-2xl border border-amber-200 bg-white">
            {#each unparsedPackages as pkg}
              <div class="flex flex-col gap-2 p-4">
                <div class="text-sm font-semibold text-neutral-900">{pkg.ndc}</div>
                <div class="text-sm text-neutral-600">{pkg.description}</div>
                {#if pkg.labelerName}
                  <div class="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    {pkg.labelerName}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </article>
      {/if}

      <article class="rounded-3xl bg-neutral-900 p-6 text-neutral-100 shadow-lg ring-1 ring-neutral-800">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <h3 class="text-lg font-semibold">Structured JSON Output</h3>
          <button
            class="rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-200 transition hover:bg-amber-500 hover:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-amber-300"
            on:click={copyJson}
          >
            {#if copySuccess}
              Copied!
            {:else}
              Copy JSON
            {/if}
          </button>
        </div>
        <pre class="mt-4 max-h-80 overflow-y-auto rounded-2xl bg-neutral-950 p-4 text-xs leading-relaxed text-amber-100">
{result.json}</pre
        >
      </article>
    {:else}
      <div class="rounded-3xl border border-dashed border-amber-200 bg-amber-50 px-8 py-12 text-center text-neutral-600">
        Submit a prescription to see recommended NDC packages, warnings, and structured output here.
      </div>
    {/if}
  </div>
</section>
