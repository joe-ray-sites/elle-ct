// Built-in practice set so the app is usable the moment it opens.
// Every question, passage and explanation here is original — written for
// ElleCT in the ACT's format, not taken from any ACT test.

export const STARTER_SOURCE = 'Starter test';

const P = {
  english: `THE NIGHT MARKET

[1] Every Friday in summer, the parking lot behind the library turns into a night market, dozens of vendors set up folding tables before sunset. The smell of grilled corn and fresh churros drift across the lot. Vendors who's stalls face the street get the most foot traffic, so the spots along the curb are claimed first.

[2] The market, which is a weekly event that happens every week, has grown faster than anyone planned. In its first year the market had twelve vendors; by its third it had over one hundred. The library itself was built in 1962.

[3] Parking is scarce on market nights. As a result, most regulars arrive by bike or on foot, and the bike racks fill an hour before the first table is unfolded.`,

  reading: `INFORMATIONAL: This passage is about a small-town library's seed collection.

When Marisol Okafor took over the reference desk at the Bellhaven Public Library, she inherited a filing cabinet nobody wanted. The drawers were labeled A through Z, but the folders inside held no documents. They held seeds: tomatoes from a retired welder on Pine Street, beans that a family had carried from Oaxaca two generations earlier, a squash variety that appeared in no catalog Okafor could find.

The seed library worked on trust. Patrons "borrowed" a packet in spring, grew the plants, and returned seeds from the healthiest specimens in fall. There were no fines and no due dates, and roughly a third of the packets never came back. Okafor's predecessor had treated this as a failure. Okafor saw it differently. A packet that never returned had usually become a garden, and a garden, she reasoned, was the point.

Still, the collection was shrinking. In her first year she counted 212 varieties; by the third, 140. The losses were not random. Rare, finicky varieties—the ones that mattered most—vanished first, because the gardeners willing to nurse them were few, and the gardeners willing to save seed from them properly were fewer.

Her solution was unglamorous. She began hosting a monthly "seed night," at which experienced growers showed newcomers how to isolate plants, when to harvest, and how to dry and label what they saved. Attendance was modest. But the following fall, returns rose for the first time in six years, and eleven varieties that had been listed as lost came back through the door in envelopes with handwritten notes.`,

  science: `A student investigated how water temperature and stirring affect the time required for a 4 g sugar cube to dissolve completely in 200 mL of water.

Experiment 1
Cubes were placed in unstirred water at four temperatures. Each condition was tested 3 times and the times were averaged.

Table 1
Temperature (°C)    Time to dissolve (s)
       10                  412
       25                  260
       40                  151
       55                   88

Experiment 2
The procedure was repeated at 25°C while the water was stirred at a constant rate. Three stirring speeds were tested, again 3 trials each.

Table 2
Stirring speed (rpm)    Time to dissolve (s)
         0                     260
        60                     142
       120                      95`,
};

const Q = (subject, number, stem, choices, answer, explanation, tags, passage = null) =>
  ({ subject, number, stem, choices: choices.map((t, i) => ({ letter: (number % 2 ? 'ABCDE' : 'FGHJK')[i], text: t })), answer, explanation, tags, passage });

export const STARTER = {
  source: STARTER_SOURCE,
  passages: [
    { key: 'english', label: 'Passage I', text: P.english },
    { key: 'reading', label: 'Passage I', text: P.reading },
    { key: 'science', label: 'Passage I', text: P.science },
  ],
  questions: [
    // ------------------------------------------------------------ English
    Q('English', 1, 'Every Friday in summer, the parking lot behind the library turns into a night market, dozens of vendors set up folding tables before sunset.\n\nThe underlined portion is "market, dozens".',
      ['NO CHANGE', 'market; dozens', 'market dozens', 'market, dozens of vendors,'], 'B',
      'Two complete sentences joined by only a comma is a comma splice. A semicolon can join two independent clauses on its own; nothing else here can.', ['punctuation', 'semicolon-colon-dash', 'conventions-of-standard-english'], 'english'),
    Q('English', 2, 'The smell of grilled corn and fresh churros drift across the lot.\n\nThe underlined portion is "drift".',
      ['NO CHANGE', 'drifts', 'are drifting', 'have drifted'], 'G',
      'Cross out the prepositional phrase: "The smell … drifts." The subject is the singular "smell", not "corn and churros".', ['agreement-tense', 'conventions-of-standard-english'], 'english'),
    Q('English', 3, "Vendors who's stalls face the street get the most foot traffic.\n\nThe underlined portion is \"who's\".",
      ['NO CHANGE', 'whose', 'who', 'whom'], 'B',
      '"Who\'s" only ever means "who is". Expand it: "vendors who is stalls" fails. The possessive is "whose".', ['pronouns-apostrophes', 'conventions-of-standard-english'], 'english'),
    Q('English', 4, 'The market, which is a weekly event that happens every week, has grown faster than anyone planned.\n\nThe underlined portion is "which is a weekly event that happens every week,".',
      ['NO CHANGE', 'which happens weekly every week,', 'a weekly event,', 'which is an event occurring on a weekly basis each week,'], 'H',
      '"Weekly" and "every week" say the same thing. When two choices are both grammatical, the ACT wants the shorter one without the redundancy.', ['conciseness', 'knowledge-of-language'], 'english'),
    Q('English', 5, 'In its first year the market had twelve vendors; by its third it had over one hundred.\n\nWhich choice most effectively emphasizes how quickly the market grew?',
      ['NO CHANGE', 'a few more.', 'some new ones.', 'more than that.'], 'A',
      'The question asks for emphasis on speed of growth. Only a specific, large number does that job; the other choices are vague.', ['rhetorical-skills', 'production-of-writing'], 'english'),
    Q('English', 6, 'Parking is scarce on market nights. As a result, most regulars arrive by bike or on foot.\n\nThe underlined portion is "As a result,".',
      ['NO CHANGE', 'However,', 'For example,', 'Nevertheless,'], 'F',
      'The second sentence is a consequence of the first, so a cause-and-effect transition fits. "However" and "Nevertheless" signal contrast that is not there.', ['organization', 'production-of-writing'], 'english'),
    Q('English', 7, 'The writer is considering deleting the sentence "The library itself was built in 1962." Should the sentence be deleted?',
      ['Yes, because it interrupts the description of the market with an unrelated detail.', 'Yes, because it contradicts information earlier in the essay.', 'No, because it explains why the market is held at the library.', 'No, because it states the essay\'s main claim.'], 'A',
      'Decide yes or no first: the sentence is about the building, not the market, so it should go. Then pick the reason that matches — it is a detour, not a contradiction.', ['author-purpose', 'production-of-writing'], 'english'),
    Q('English', 8, 'The writer wants to add the following sentence to the essay:\n\n"By ten o\'clock the tables are folded and the lot is empty again."\n\nThe sentence would most logically be placed:',
      ['at the beginning of Paragraph 1.', 'after the first sentence of Paragraph 1.', 'at the end of Paragraph 2.', 'at the end of Paragraph 3.'], 'J',
      'The sentence describes the market closing, so it belongs at the end of the essay, after the last description of the market in operation.', ['organization', 'production-of-writing'], 'english'),

    // --------------------------------------------------------------- Math
    Q('Math', 1, 'If 3(x − 4) = 2x + 5, what is the value of x?', ['7', '9', '13', '17', '21'], 'D',
      'Distribute: 3x − 12 = 2x + 5. Subtract 2x and add 12: x = 17.', ['algebra']),
    Q('Math', 2, 'A rectangle has a perimeter of 34 units and a width of 5 units. What is its area, in square units?', ['29', '60', '85', '120', '170'], 'G',
      'Perimeter = 2(l + w), so l + 5 = 17 and l = 12. Area = 12 × 5 = 60. Choice K is the trap for multiplying perimeter by width.', ['geometry', 'word-problem']),
    Q('Math', 3, 'What is the slope of the line through the points (2, −3) and (6, 5) in the standard (x, y) coordinate plane?', ['−2', '1/2', '2', '4', '8'], 'C',
      'Slope = (5 − (−3)) / (6 − 2) = 8 / 4 = 2. Watch the double negative: 5 − (−3) is 8, not 2.', ['coordinate-geometry']),
    Q('Math', 4, 'What is the mean of 12, 15, 21, 8, and 19?', ['12', '15', '16', '19', '21'], 'G',
      'Sum = 75; 75 ÷ 5 = 15. (The median is also 15 here, but the question asked for the mean — always find the total first.)', ['statistics-probability']),
    Q('Math', 5, 'A bag contains 4 red marbles and 6 blue marbles. If one marble is drawn at random, what is the probability that it is blue?', ['2/5', '1/2', '3/5', '2/3', '3/4'], 'C',
      'Probability = favorable / total = 6 / 10 = 3/5. Choice D (6/9) is the trap for using only the red marbles as the denominator.', ['statistics-probability']),
    Q('Math', 6, 'What is 15% of 240?', ['24', '36', '48', '60', '225'], 'G',
      '10% of 240 is 24; 5% is 12; together 36. Choice K is 240 − 15, not 15% of 240.', ['number-quantity', 'essential-skills']),
    Q('Math', 7, 'If f(x) = 2x² − 3x + 1, what is f(−2)?', ['−13', '−1', '3', '15', '21'], 'D',
      'f(−2) = 2(4) − 3(−2) + 1 = 8 + 6 + 1 = 15. The classic miss is −3 × −2 = −6 instead of +6, which gives choice C.', ['functions', 'algebra']),
    Q('Math', 8, 'A right triangle has legs of length 9 and 12. What is the length of its hypotenuse?', ['13', '15', '17', '21', '225'], 'G',
      '9-12-15 is the 3-4-5 triple scaled by 3. Or: 81 + 144 = 225, and √225 = 15. Choice K forgot the square root.', ['geometry']),
    Q('Math', 9, 'Which of the following describes all values of x for which 5 − 2x > 11?', ['x < −3', 'x > −3', 'x < 3', 'x > 3', 'x < 8'], 'A',
      'Subtract 5: −2x > 6. Dividing by a negative flips the inequality: x < −3. Choice B is the sign-flip miss.', ['algebra']),
    Q('Math', 10, 'After a 20% discount, a shirt costs $40. What was the original price?', ['$32', '$48', '$50', '$60', '$80'], 'H',
      'The sale price is 80% of the original: 0.8p = 40, so p = 50. Choice G (40 × 1.2) is the trap — adding 20% back does not undo taking 20% off.', ['number-quantity', 'word-problem', 'modeling']),

    // ------------------------------------------------------------ Reading
    Q('Reading', 1, 'The main purpose of the passage is to:',
      ['argue that libraries should stop lending seeds.', 'describe how a librarian revived a declining seed collection.', 'explain the biology of seed saving.', 'compare seed libraries in several towns.'], 'B',
      'The passage follows one person, one collection, and one fix. Nothing in it argues against seed libraries or explains biology in any depth.', ['big-picture', 'key-ideas-details'], 'reading'),
    Q('Reading', 2, 'As it is used in the second paragraph, the word "trust" most nearly means:',
      ['legal ownership of property.', 'confidence that patrons would act responsibly without enforcement.', 'a financial arrangement.', 'a signed agreement.'], 'G',
      'The sentences that follow define it: no fines, no due dates. Cover the word and describe the system — it runs on people doing the right thing unsupervised.', ['vocab-in-context', 'craft-structure'], 'reading'),
    Q('Reading', 3, 'According to the passage, roughly what fraction of borrowed packets were never returned?',
      ['a tenth', 'a third', 'half', 'two-thirds'], 'B',
      'Stated directly in paragraph 2: "roughly a third of the packets never came back."', ['detail', 'key-ideas-details'], 'reading'),
    Q('Reading', 4, 'It can reasonably be inferred that Okafor\'s predecessor believed a packet that was never returned was:',
      ['evidence that the program was failing.', 'proof that a garden had been planted.', 'the fault of the labeling system.', 'an acceptable loss.'], 'F',
      'The predecessor "treated this as a failure"; Okafor "saw it differently." Choice G is Okafor\'s view, not the predecessor\'s — read who each sentence is about.', ['inference', 'key-ideas-details'], 'reading'),
    Q('Reading', 5, 'The passage indicates that rare varieties disappeared first because:',
      ['patrons preferred common vegetables.', 'few gardeners could grow them, and fewer could save their seed correctly.', 'the library removed them from circulation.', 'they were unsuited to the local climate.'], 'B',
      'Paragraph 3 gives the reason outright. The other choices sound plausible but appear nowhere in the text — if you cannot point to the line, it is a guess.', ['detail', 'key-ideas-details'], 'reading'),
    Q('Reading', 6, 'The author most likely describes Okafor\'s solution as "unglamorous" in order to emphasize that it was:',
      ['expensive to run.', 'unsuccessful at first.', 'practical rather than dramatic.', 'embarrassing to her.'], 'H',
      'The word sets up the contrast the paragraph delivers: a plain monthly class produced the first real improvement in six years.', ['craft-structure', 'inference'], 'reading'),
    Q('Reading', 7, 'Which of the following best describes the change in the collection between Okafor\'s first and third years?',
      ['It grew from 140 to 212 varieties.', 'It shrank from 212 to 140 varieties.', 'It held steady at about 200 varieties.', 'The passage does not give figures.'], 'B',
      'Paragraph 3: "212 varieties; by the third, 140." Choice A reverses the numbers — half-right is all wrong.', ['detail', 'key-ideas-details'], 'reading'),

    // ------------------------------------------------------------ Science
    Q('Science', 1, 'According to Table 1, as water temperature increased, the time to dissolve:',
      ['increased only.', 'decreased only.', 'increased, then decreased.', 'remained constant.'], 'B',
      'Trace the column with your finger: 412 → 260 → 151 → 88. Every step goes down.', ['trends', 'interpretation-of-data'], 'science'),
    Q('Science', 2, 'Based on Table 1, the time to dissolve at 70°C would most likely have been:',
      ['less than 88 s.', 'between 88 s and 151 s.', 'between 151 s and 260 s.', 'greater than 260 s.'], 'F',
      '70°C is beyond the highest temperature tested, and the trend is falling, so the time continues below the 55°C value of 88 s.', ['trends', 'interpretation-of-data'], 'science'),
    Q('Science', 3, 'In Experiment 2, which of the following was held constant?',
      ['Stirring speed', 'Water temperature', 'Time to dissolve', 'None of the variables'], 'B',
      'Experiment 2 varied stirring speed at a single temperature, 25°C. Time to dissolve was the measured result, not a controlled variable.', ['research-summaries', 'scientific-investigation'], 'science'),
    Q('Science', 4, 'According to Table 2, increasing the stirring speed from 0 rpm to 120 rpm reduced the time to dissolve by approximately:',
      ['95 s', '118 s', '165 s', '260 s'], 'H',
      '260 − 95 = 165 s. Choice F is the 120 rpm time itself, not the reduction; choice G is the 0 → 60 change.', ['data-representation', 'interpretation-of-data'], 'science'),
    Q('Science', 5, 'Which condition from Experiment 1 serves as the control for Experiment 2?',
      ['10°C', '25°C', '40°C', '55°C'], 'B',
      'Experiment 2 was run at 25°C; its 0 rpm row (260 s) matches the unstirred 25°C result in Table 1 exactly.', ['research-summaries', 'scientific-investigation'], 'science'),
    Q('Science', 6, 'A student claims that stirring at 60 rpm shortens the dissolving time more than raising the temperature from 25°C to 40°C does. Do the data support this claim?',
      ['Yes; 60 rpm gave 142 s, while 40°C gave 151 s.', 'Yes; 60 rpm gave 95 s.', 'No; 40°C gave a shorter time than 60 rpm did.', 'No; the two experiments used different cube masses.'], 'F',
      'Compare the two numbers directly: 142 s (stirred, 25°C) beats 151 s (unstirred, 40°C), so the claim holds. Choice G quotes the wrong row.', ['evaluation-models-inferences', 'data-representation'], 'science'),
    Q('Science', 7, 'The student most likely averaged 3 trials at each condition in order to:',
      ['reduce the effect of random variation in individual measurements.', 'raise the water temperature between trials.', 'dissolve each cube three times.', 'test three different kinds of sugar.'], 'A',
      'Repeating and averaging is the standard way to keep one odd measurement from distorting a result. Nothing in the passage mentions different sugars or reheating.', ['scientific-investigation'], 'science'),
  ],
};
