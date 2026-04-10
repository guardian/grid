// this file reproduces the freeImage filter by copying the config from this file:
// common-lib/src/main/scala/com/gu/mediaservice/lib/guardian/GuardianUsageRightsConfig.scala
// This file is intended to be deleted once the grid only ingests free images

const freeUsageRightsCategories = [
	'commissioned-agency', // Free
	'PR Image', // Conditional
	'handout', // Conditional
	'screengrab', // Free
	'guardian-witness', // Free
	'original-source', // Free
	'social-media', // Conditional
	'Bylines', // Free
	'obituary', // Free
	'staff-photographer', // Free
	'contract-photographer', // Free
	'commissioned-photographer', // Free
	'pool', // Conditional
	'crown-copyright', // Free
	'staff-illustrator', // Free
	'contract-illustrator', // Free
	'commissioned-illustrator', // Free
	'creative-commons', // Free
	'composite', // Free
	'public-domain', // Free
	'programmes-organisation-owned', // Free
	'programmes-independents', // Free
	'programmes-acquisitions', // Free
];

// Free suppliers and their excluded collections - mirrors GuardianUsageRightsConfig.scala
// Suppliers in suppliersCollectionExcl get a must+must_not query; others get a simple terms query
const suppliersWithExclusions: Record<string, string[]> = {
	'Getty Images': [
		'Arnold Newman Collection',
		'360cities.net Editorial',
		'360cities.net RM',
		'age fotostock RM',
		'Alinari',
		'ASAblanca',
		'Barcroft Media',
		'Bloomberg',
		'Bob Thomas Sports Photography',
		'Carnegie Museum of Art',
		'Catwalking',
		'Contour',
		'Contour RA',
		'Corbis Premium Historical',
		'Editorial Specials',
		'Reportage Archive',
		'Gamma-Legends',
		'Genuine Japan Editorial Stills',
		'Genuine Japan Creative Stills',
		'George Steinmetz',
		'Getty Images Sport Classic',
		'Iconic Images',
		'Iconica',
		'Icon Sport',
		'Kyodo News Stills',
		'Lichfield Studios Limited',
		'Lonely Planet Images',
		'Lonely Planet RF',
		'Masters',
		'Major League Baseball Platinum',
		'Moment Select',
		'Mondadori Portfolio Premium',
		'National Geographic',
		'National Geographic RF',
		'National Geographic Creative',
		'National Geographic Magazines',
		'NBA Classic',
		'Neil Leifer Collection',
		'Newspix',
		'PA Images',
		'Papixs',
		'Paris Match Archive',
		'Paris Match Collection',
		'Pele 10',
		'Photonica',
		'Photonica World',
		'Popperfoto',
		'Popperfoto Creative',
		'Premium Archive',
		'SAMURAI JAPAN',
		'Sports Illustrated',
		'Sports Illustrated Classic',
		'Sportsfile',
		'Sygma Premium',
		"Terry O'Neill",
		'The Asahi Shimbun Premium',
		'The LIFE Premium Collection',
		'ullstein bild Premium',
		'Ulrich Baumgarten',
		'VII Premium',
		'Vision Media',
		'Xinhua News Agency',
	],
};

const suppliersWithoutExclusions = [
	'AAP',
	'Alamy',
	'Allstar Picture Library',
	'AP',
	'EPA',
	'PA',
	'Reuters',
	'Rex Features',
	'Ronald Grant Archive',
	'Action Images',
];

// Mirrors SearchFilters.scala freeFilter:
// OR of freeSupplierFilter (suppliers with/without collection exclusions) and freeUsageRightsFilter (categories)
export const freeFilter = {
	bool: {
		should: [
			// suppliersWithExclusionsFilter: one must+must_not clause per supplier
			...Object.entries(suppliersWithExclusions).map(
				([supplier, excludedCollections]) => ({
					bool: {
						must: { term: { 'usageRights.supplier': supplier } },
						must_not: {
							terms: { 'usageRights.suppliersCollection': excludedCollections },
						},
					},
				}),
			),
			// suppliersNoExclusionsFilter: simple terms on supplier
			{ terms: { 'usageRights.supplier': suppliersWithoutExclusions } },
			// freeUsageRightsFilter: terms on category
			{ terms: { 'usageRights.category': freeUsageRightsCategories } },
		],
		minimum_should_match: 1,
	},
};
