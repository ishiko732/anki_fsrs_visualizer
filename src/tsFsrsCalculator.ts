import { createEmptyCard, fsrs, generatorParameters, type Grade } from "ts-fsrs";

export class TsFsrsCalculator {
    readonly w: number[];
    readonly request_retention: number;
    readonly enable_short_term: boolean;

    public constructor(w: number[], m: number[], enable: boolean) {
        this.w = w;
        this.request_retention = m[0];
        this.enable_short_term = enable;
    }

    calcDisplayDifficulty(d: number) {
        return (d - 1.0) / 9.0 * 100.0;
    }

    public steps(reviews: number[]): Card[] {
        const day = 24 * 60 * 60 * 1000;
        const first_date = new Date();
        let fsrs_card = createEmptyCard(first_date);

        let card = new Card(0, 0.0, 0.0, 0.0, 0.0, 0.0, 0, first_date);
        const list = [];
        let last_date = first_date;

        const f = fsrs(generatorParameters({
            w: this.w,
            request_retention: this.request_retention,
            enable_short_term: this.enable_short_term
        }));

        for (const review of reviews) {
            const date = fsrs_card.due
            fsrs_card = f.next(fsrs_card, date, <Grade>review, (recordItem) => {
                const { card } = recordItem;
                const interval = f.next_interval(card.stability, card.elapsed_days)
                card.due = new Date(date.getTime() + interval * day);
                card.scheduled_days = interval;
                return card
            });

            const displayDifficulty = this.calcDisplayDifficulty(fsrs_card.difficulty);
            const interval = fsrs_card.scheduled_days;
            const cumulativeInterval = card.cumulativeInterval + interval;
            card.cumulativeInterval = cumulativeInterval;
            const next_card = new Card(fsrs_card.state, fsrs_card.difficulty, displayDifficulty, fsrs_card.stability, interval, cumulativeInterval, review, fsrs_card.last_review!)
            last_date = fsrs_card.due
            list.push(next_card);
            for (const item of list) {
                const retrievability = f.forgetting_curve((last_date.getTime() - item.last_review.getTime()) / day, next_card.stability) * 100;
                item.retrievability.push(retrievability);
            }
        }
        return list;
    }
}

export class Card {
    state: number;
    difficulty: number;
    displayDifficulty: number;
    stability: number;
    interval: number;
    cumulativeInterval: number;
    grade: number;
    last_review: Date;
    retrievability: number[] = []

    public constructor(state: number, difficulty: number, displayDifficulty: number, stability: number, interval: number, cumulativeInterval: number, grade: number, last_review: Date) {
        this.state = state;
        this.difficulty = difficulty;
        this.displayDifficulty = displayDifficulty;
        this.stability = stability;
        this.interval = interval;
        this.cumulativeInterval = cumulativeInterval;
        this.grade = grade;
        this.last_review = last_review;
    }
}
