<script lang="ts">
    let {
        liked,
        disabled = false,
        ontoggle,
    }: {
        liked: boolean;
        disabled?: boolean;
        ontoggle: () => void;
    } = $props();

    const label = $derived(
        liked 
            ? "Remove from Liked songs"
            : "Add to Liked songs",
    );
</script>


<button
    class="favorite-button"
    class:liked
    type="button"
    aria-label={label}
    aria-pressed={liked}
    title={label}
    {disabled}
    onclick={ontoggle}
>
    <svg
        viewBox="0 0 24 24"
        fill={liked ? "currentColor" : "none" }
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
    >
        <path 
            d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"
        />
    </svg>
</button>


<style>
    .favorite-button {
        display: grid;
        flex: none;
        place-items: center;
        width: 34px;
        height: 34px;
        padding: 7px;
        border: 1px solid transparent;
        border-radius: 50%;
        color: var(--color-muted);
        background: transparent;
        cursor: pointer;
    }

    .favorite-button:enabled:hover {
        color: var(--color-accent-ink);
        background-color: var(--color-accent-soft);
    }

    .favorite-button.liked {
        color: var(--color-accent-ink);
    }

    .favorite-button:disabled {
        opacity: 0.35;
        cursor: not-allowed;
    }

    svg {
        width: 20px;
        height: 20px;
    }
</style>

