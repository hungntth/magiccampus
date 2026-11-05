# Daily answer + quiz event (M10 phase G)

Plan `docs/plans/2026-11-04_13_DUNGEONS.md` §2.5, notes "phases E, G, H". Legacy `daily-answer.md`, `quiz-event.md`, research
`2026-10-23_09_QUIZ_AND_DONGXUAN_ARENA_RESEARCH.md` part 1.

- Questions: `gamedata/answer-quiz.ts` (TBL_ANSWER rows with a valid right option; shared with Lục Tiên / Thám Hiểm / maze).
- Daily answer `modules/answer/` (`character_answer`), NPC 9001 on map 1 (func `daily_answer_open`), RPCs getAnswer, getAnswerByMoney,
  selAnswer (1 right / 2 wrong / 3 invalid / 4 timeout), push onGetAnswer.
- Quiz `modules/quiz/`: in-memory contest (`quiz-contest.ts`, 500 ms scheduler, Tue/Thu/Sat 20:00 UTC+7), `character_quiz_stats`
  (joined / first / owed exp + bags granted on the next login), RPCs subQuestionApply, subAnswer, useFDJ, useXYX, useXLY, dropQuestion,
  canQuest, GM `gmQuiz(action, regSeconds?)` + chat `/quiz start [secs] | stop | status`. onShowQuestion carries the text in `q`.
- Client `ui/answerPanel.ts`, `ui/quizPanel.ts`, `game/QuizController.ts`, strip 16. All RPCs not quiet.

## M11 mail (2026-11-05)
Settlement bags (item 4875, bound) are always mailed through `MailSystemService` as in Go `rewards.go`; offline players keep only `owedExp`; legacy `owedBags` rows become a mail at the next login. See `memory/mail.md`.
