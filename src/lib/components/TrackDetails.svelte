<script lang="ts">
    type Props = {
        title: string;
        artist: string | null;
        album: string | null;
        coverUrl: string | null;
        isLoading: boolean;
        error: string;
        status: string;
    };

    let {
        title,
        artist,
        album,
        coverUrl,
        isLoading,
        error,
        status,
    }: Props = $props();

    let failedCover = $state<string | null> (null);

    const credits = $derived(
        [artist, album].filter(Boolean).join(" · "),
    );

    const subtitle = $derived(
        isLoading
            ? "Reading tags..."
            : error || credits || status,
    );
</script>


<div class="track-details" aria-busy={isLoading}>
    {#if coverUrl && coverUrl !== failedCover}
        <img
            class="track-cover"
            src={coverUrl}
            alt=""
            width="44"
            height="44"
            onerror={() => {
                failedCover = coverUrl;
            }}
        />
    {/if}

    <div class="track-text">
        <h2 id="track-heading" title={title}>
            {title}
        </h2>

        <p title={subtitle}>
            {subtitle}
        </p>
    </div>
</div>



<style>
    .track-details {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        width: 100%;
        min-width: 0;
        min-height: 52px;
    }

    .track-cover {
        flex: 0 0 44px;
        width: 44px;
        height: 44px;
        object-fit: cover;
        border-radius: 8px;
    }

    .track-text {
        min-width: 0;
        text-align: center;
    }

    h2 {
        margin: 0;
        overflow: hidden;
        font-size: clamp(20px, 2.5vw, 28px);
        font-weight: 650;
        line-height: 1.2;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    p {
        margin: 5px 0 0;
        overflow: hidden;
        color: #77716a;
        font-size: 12px;
        line-height: 1.4;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
