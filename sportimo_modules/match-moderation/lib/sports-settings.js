module.exports = {
	soccer: {
		sport_name: "soccer",		//	The name of the Sport
		time_dependant: false, 			// 	Sport is time dependent (Time is controlled by input ex."Basket")
		main_segments: 2,
		max_segments: 5,
		segments: [
			{
				name: { en: "Pre Game", ar: "ماقبل المباراة" },  //  Name of segment / There should alwayz be a Pre Game segment
				timed: false   // Timers advances while in this segment
			},
			{
				name: { en: "First Half", ar: "الشوط الأول الأول" },
				timed: true,
				initialTime: 0    // Timer should start here in this segment
			},
			{
				name: { en: "Half Time", ar: "استراحة الشوطينالشوطين الأول" },
				timed: false
			},
			{
				name: { en: "Second Half", ar: "الشوط الثاني" },
				timed: true,
				initialTime: 45
			},
			{
				name: { en: "Match Ended", ar: "نهاية المباراة" },
				timed: false
			},
			{
				name: { en: "Overtime First Half", ar: "الشوط الإضافي الأول" },
				timed: true,
				initialTime: 90
			},
			{
				name: { en: "Overtime Half Time", ar: "استراحة بين الشوطين الإضافيين" },
				timed: false
			},
			{
				name: { en: "Overtime Second Half", ar: "الشوط الإضافي الثاني" },
				timed: true,
				initialTime: 105
			},
			{
				name: { en: "Overtime Ended", ar: "نهاية الوقت الإضافي" },
				timed: false
			},
			{
				name: { en: "Penalties", ar: "ضربات الترجيح" },
				timed: false
			}

		]

	}
}