import type { AnimationItem, LottiePlayer } from "lottie-web";
import type { LottieAnimation, LottieAnimationConfig } from "./types";




const DEFAULT: Partial<LottieAnimationConfig> = {
    player: "light",
    loop: true,
    autoplay: "visible",
    visibleThreshold: 0,
};


let loadedPlayerType: LottieAnimationConfig["player"] | undefined;
let lottie: LottiePlayer | undefined;
let observer: IntersectionObserver | undefined;

// store the animation json data, map url -> data
const animationDataMap = new Map<string, string>();

// store the current-page animations
const animations: LottieAnimation[] = [];


async function setupLottie() {
    const containers = getContainers();
    // if no lottie animation, stop
    if (containers.length === 0) {
        return;
    }

    const isFull = containers.some(([, config]) => config.player === "full");
    const lottie = await loadLottie(isFull ? "full" : "light");

    // if no lottie player available, stop
    if (!lottie) {
        return;
    }

    await loadAnimations(containers.map(([, config]) => config.src));

    // setup the containers
    const animations = containers.map(([container, config]) => {
        const id = config.id || `A${Math.random().toFixed(6).substring(2)}`;

        const animationData = animationDataMap.get(config.src);
        let player: AnimationItem | undefined;
        if (animationData) {
            const { loop, autoplay } = config;
            player = lottie.loadAnimation({
                container,
                loop,
                autoplay: autoplay === "visible" ? false : autoplay,
                animationData,
                rendererSettings: {
                    viewBoxOnly: true,
                },
            });
        }

        return Object.freeze({
            id,
            config,
            container,
            isLoaded: !!player,
            player,
        }) as LottieAnimation;
    });

    observer?.disconnect();

    const toObserve = animations.filter(x => x.isLoaded && x.config.autoplay === "visible");
    if (toObserve.length > 0) {
        // pick the min threshold as the common for all animations
        const threshold = toObserve.reduce((r, x) => Math.max(0, Math.min(x.config.visibleThreshold || 0, r)), 1);
        observer = new IntersectionObserver(entries => {
            entries.forEach(x => {
                const animation = animations.find(y => y.container === x.target);
                if (animation && animation.isLoaded) {
                    if (x.isIntersecting && x.intersectionRatio >= threshold) {
                        animation.player.play();
                    } else {
                        animation.player.pause();
                    }
                }
            });
        }, { threshold });

        toObserve.forEach(x => {
            observer!.observe(x.container);
        });
    }

    // raise custom ready event
    document.dispatchEvent(new CustomEvent("astro-lottie-loaded", {
        detail: window.astroLottie!
    }));
}


async function loadLottie(player: LottieAnimationConfig["player"]) {
    // cannot load the full player if the light one is already loaded
    if (loadedPlayerType && loadedPlayerType !== "full" && loadedPlayerType !== player) {
        console.error("Mixed Lottie player type is unsupported. Explicitly set 'full' as player in your LottieComponents")
        return;
    }

    // if already loaded, return in
    if (lottie) {
        return lottie;
    }

    return await (player === "full"
        ? import("lottie-web")
        : import("lottie-web/build/player/lottie_light")
    )
        .then(x => {
            // assign local cache
            lottie = x.default;

            // create global object
            window.lottie = lottie;
            window.astroLottie = {
                getAllAnimations() {
                    return animations.slice();
                },
                getAnimation(key) {
                    if (typeof key === "string") {
                        return animations.find(x => x.id === key);
                    } else if (typeof key === "object") {
                        if ("container" in key) {
                            return animations.find(x => x.container === key.container);
                        } else if ("elementId" in key) {
                            return animations.find(x => x.container.id === key.elementId);
                        }
                    }
                    throw new Error("Invalid LottieAnimation source: " + key)
                },
            };

            return lottie;
        })
        .catch(err => {
            console.warn("Cannot load lottie-web script", err);
        });

}

function getContainers() {
    return [...document.querySelectorAll("[data-lottie]")].map(x => {
        try {
            return [x, { ...DEFAULT, ...JSON.parse(x.getAttribute("data-lottie-data") || "") }];
        } catch (err) {
            console.warn("Cannot parse lottie animation data", x);
        }
    }).filter(Boolean) as [HTMLElement, LottieAnimationConfig][];
}

function loadAnimations(sources: string[]) {
    return Promise.all([...new Set(sources)].filter(x => !animationDataMap.has(x))
        .map(async src => {
            const response = await fetch(src).catch(() => { }); // swallow all errors
            if (!response || response.status >= 400) {
                console.warn("Cannot load animation(%s)", src);
                return;
            }

            const data = await response.json().catch(() => { });
            if (!data) {
                console.warn("Cannot load animation(%s)", src);
                return;
            }

            // put into cache
            animationDataMap.set(src, data);
        })
    );
}






//assign as global object
// window.lottie = lottie;
// window.astroLottie = {
//     getAllAnimations() {
//         return animations.slice();
//     },
//     getAnimation(key) {
//         if (typeof key === "string") {
//             return animations.find(x => x.id === key);
//         } else if (typeof key === "object") {
//             if ("container" in key) {
//                 return animations.find(x => x.container === key.container);
//             } else if ("elementId" in key) {
//                 return animations.find(x => x.container.id === key.elementId);
//             }
//         }
//         throw new Error("Invalid LottieAnimation source: " + key)
//     },
// };




console.debug("loader");


// delay the first setup
setTimeout(setupLottie, 0);

// support view transition
// skip setup the first time
let isFirstTime = true;
document.addEventListener("astro:page-load", () => {
    if (isFirstTime) {
        isFirstTime = false;
        return;
    }

    setupLottie();
    console.log("page-load");
});
