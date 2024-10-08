<template>
    <div class="container-top">
        <div class="reviews">
            <div>
                <button @click="resetReviews">Reset reviews</button>
            </div>
            <div class="small-hint">1=Again, 2=Hard, 3=Good, 4=Easy</div>
            <textarea v-model="reviews_text"></textarea>
        </div>
        <div style="position: relative; flex: 1;">
            <Line :data="data" :options="options" />
        </div>
    </div>
    <div class="whole">
        <input v-model.lazy="w_text" v-on:change="commit"
            style="height: 100%; width: 100%; box-sizing: border-box; resize: none;" />
    </div>
    <div style="display: flex; flex-wrap: wrap; gap: 2px; align-items: center;">
        <button @click="reset">Reset parameters</button>
        <button @click="undo" :disabled='!canUndo'>Undo</button>
        <button @click="redo" :disabled='!canRedo'>Redo</button>
        {{ undoStack.length }} / {{ redoStack.length + undoStack.length }}
        <div>
            <input id="mode-interval" type="radio" :value="nameof<Card>('interval')" v-model="mode" />
            <label for="mode-interval">Interval</label>
        </div>
        <div>
            <input id="mode-stability" type="radio" :value="nameof<Card>('stability')" v-model="mode" />
            <label for="mode-stability">Stability</label>
        </div>
        <div>
            <input id="mode-displayDifficulty" type="radio" :value="nameof<Card>('displayDifficulty')" v-model="mode" />
            <label for="mode-displayDifficulty">Difficulty</label>
        </div>
        <div>
            <input id="mode-cumulativeInterval" type="radio" :value="nameof<Card>('cumulativeInterval')"
                v-model="mode" />
            <label for="mode-cumulativeInterval">CumulativeInterval</label>
        </div>
        <div>
            <input id="animation" type="checkbox" v-model="animation" />
            <label for="animation">Animation</label>
        </div>
        <div :title="short_term_desc">
            <input id="short_term" type="checkbox" v-model="fsrs_params.short_term" />
            <label for="short_term">Short-term</label>
        </div>
    </div>
    <div style="font-size: 75%; width: 100%;">
        <Slider v-for="(slider, index) in additionalSliders" :info="slider" v-model="fsrs_params.m[index]"
            v-on:change="commit" />
        <Slider v-for="(slider, index) in sliders" :info="slider" v-model="fsrs_params.w[index]" v-on:change="commit" />
    </div>
    <table class="table-dataset">
        <thead>
            <tr>
                <td>Grade</td>
                <td v-for="label in data.labels">
                    {{ modeOf(mode) }}-{{ label }}
                </td>
            </tr>
        </thead>
        <tbody>
            <tr v-for="dataset in data.datasets">
                <td>{{ dataset.label }}</td>
                <td v-for="item in dataset.data">
                    {{ cardDataFormat(item.card, mode) }}
                </td>
            </tr>
        </tbody>
    </table>
    <a href="https://github.com/open-spaced-repetition/anki_fsrs_visualizer/" style="font-size: 75%;">Github</a>
</template>
<style>
textarea {
    flex: 1;
    box-sizing: border-box;
}

.container-top {
    display: flex;
    height: 50vh;
    gap: 3px;
}

.small-hint {
    font-size: 70%;
}

.reviews {
    height: 100%;
    display: flex;
    flex-direction: column;
}

@media screen and (max-width: 600px) {
    .container-top {
        flex-direction: column;
    }

    .reviews {
        height: 10vh;
        width: 100%;
    }
}

.whole {
    width: 100%;
}

.whole input {
    width: 100%;
}

.table-dataset {
    border-collapse: collapse;
    margin-top: 4px;
}

.table-dataset tr:nth-child(even) {
    background-color: #f2f2f2;
}

.table-dataset td {
    border: 1px solid #ddd;
    text-align: right;
    padding: 4px;
}
</style>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import {
    Chart as ChartJS,
    Title,
    Tooltip,
    Legend,
    PointElement,
    LineElement,
    CategoryScale,
    LinearScale,
    Colors,
} from 'chart.js';
import type { ChartData, ChartDataset } from 'chart.js';
import { Card, TsFsrsCalculator } from './tsFsrsCalculator';
import { sliders, additionalSliders, default_parameters, initial_reviews } from './sliderInfo';
import { useManualRefHistory } from '@vueuse/core';
import zoomPlugin from 'chartjs-plugin-zoom';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { createOptions } from './chartOptions.js';
import { Line } from 'vue-chartjs';
import Slider from './Slider.vue';

ChartJS.register(Title, Tooltip, Legend, PointElement, LineElement, CategoryScale, LinearScale, Colors, zoomPlugin, ChartDataLabels);

function nameof<T>(name: keyof T) { return name; }

function modeOf(mode: Exclude<keyof Card,'last_review'|'retrievability'>) {
    if (mode === 'interval') {
        return 'Ivl';
    } else if (mode === 'stability') {
        return 'S';
    } else if (mode === 'displayDifficulty') {
        return 'D';
    } else if (mode === 'cumulativeInterval') {
        return 'CIvl';
    } else {
        return '';
    }
}

function cardDataFormat(card: Card, mode: Exclude<keyof Card,'last_review'|'retrievability'>) {
    if (mode === 'interval' || mode === 'cumulativeInterval') {
        return card[mode].toFixed(0);
    } else {
        return card[mode].toFixed(2)
    }
}

const mode = ref<Exclude<keyof Card,'last_review'|'retrievability'>>("interval");
const animation = ref(true);
const names = ['', 'Again', 'Hard', 'Good', 'Easy'];

const short_term_desc = 'When disabled, this allow user to skip the short-term scheduler and directly switch to the long-term scheduler.'

//can't disable animation using reactive options, so using watch
watch(animation, a => {
    if (typeof options.animation == 'object') {
        options.animation.duration = (a ? 500 : 0);
    }
});

const options = createOptions({
    title_function: (items: MyData[]) => {
        const unique = [...new Set(items.map(a => a.y))]
        return `${mode.value}: ${unique.join(', ')}`;
    },
    tooltip_function: (item: MyData) => {
        const review_text = item.review.join('');
        return `${review_text}: ${names[item.x]}, Stability: ${item.card.stability.toFixed(2)}, Difficulty: ${item.card.displayDifficulty.toFixed(0)}% Retrievability: [${item.retrievability.map(a=>`${a.toFixed(2)}%`).join(', ')}]`;
    }
});

function getDataLabel(card: Card) {
    return `${names[card.grade]} (Difficulty: ${card.displayDifficulty.toFixed(0)}%)`;
}

function convertCardToMyData(card: Card, review: number[]): MyData {
    return {
        x: card.grade,
        y: card[mode.value] as number,
        card: card,
        review: review,
        label: getDataLabel(card),
        retrievability:card.retrievability
    };
}

const reviews = ref(initial_reviews);

const reviews_text = computed({
    get: () => reviews.value.map(a => a.join('')).join('\n'),
    set: (newValue) => reviews.value = newValue.split('\n').map(a => a.split('').filter(b => ['1', '2', '3', '4'].includes(b)).map(Number)),
});

const initial_m = [0.9];

const fsrs_params = ref({
    w: [...default_parameters],
    m: [...initial_m],
    short_term: false,
});

const { commit, undo, redo, canUndo, canRedo, undoStack, redoStack } = useManualRefHistory(fsrs_params, { clone: true });

function createLabels() {
    const max = Math.max(...reviews.value.map(a => a.length));
    return Array.from({ length: max }, (_, review) => `${review}`)
}

function createData(): ChartData<'line', MyData[]> {
    const calc = new TsFsrsCalculator(fsrs_params.value.w, fsrs_params.value.m, fsrs_params.value.short_term);

    // could not use dataset's yAxisKey here because chart component is not watching it and doesn't update automatically
    return {
        labels: createLabels(),
        datasets: reviews.value.map(review => {
            return {
                label: review.join(''),
                pointRadius: 4,
                pointHoverRadius: 5,
                data: calc.steps(review).map(a => convertCardToMyData(a, review)),
            } as ChartDataset<'line', MyData[]>;
        }),
    };
}

const data = computed(createData);

const w_text = computed({
    get: () => fsrs_params.value.w.map(f => f.toFixed(4)).join(', '),
    set: (newValue) => fsrs_params.value.w = resize_array(newValue.replace(', ', ',').split(',').map(a => parseFloat(a) || 0), default_parameters.length, 0.0)
});

function resize_array<T>(arr: T[], length: number, filler: T): T[] {
    return arr.concat(new Array(Math.max(length - arr.length, 0)).fill(filler));
}

function reset() {
    for (let i in default_parameters) {
        fsrs_params.value.w[i] = default_parameters[i];
    }

    for (let i in initial_m) {
        fsrs_params.value.m[i] = initial_m[i];
    }

    commit();
}

function resetReviews() {
    reviews.value = initial_reviews;
}

export interface MyData {
    x: number,
    y: number,
    label: string,
    review: number[],
    card: Card,
    retrievability:number[]
}
</script>
