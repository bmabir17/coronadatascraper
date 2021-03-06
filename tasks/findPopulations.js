import path from 'path';
import * as fs from '../lib/fs.js';
import * as transform from '../lib/transform.js';

const dataPath = path.join('./coronavirus-data-sources/population/');

/*
  Read population data from a CSV with correct datatypes
*/
async function readPopulationFromCSV(csvPath) {
  let output = await fs.readCSV(path.resolve(dataPath, csvPath));
  let populationData = {};
  for (let item of output) {
    if (item.population) {
      populationData[item.name] = parseInt(item.population, 10);
    } else {
      throw new Error(`Invalid data in ${csvPath} for ${item.name}`);
      return;
    }
  }

  return populationData;
}

async function readPopulationData(featureCollection) {
  let populations = {
    byCity: {},
    byCounty: {
      USA: await readPopulationFromCSV('population-usa-counties.csv'),
      GBR: await readPopulationFromCSV('population-gbr-counties.csv')
    },
    byState: {
      China: await readPopulationFromCSV('population-china-admin-divisions.csv'),
      Australia: await readPopulationFromCSV('population-australia-states.csv'),
      Canada: await readPopulationFromCSV('population-canada-provinces.csv'),
      Italy: await readPopulationFromCSV('population-italy-regions.csv'),
      USA: await readPopulationFromCSV('population-usa-states-abbrev.csv')
    },
    byCountry: {},
    supplemental: await readPopulationFromCSV('population-supplemental.csv')
  };

  populations.byState.CHN = populations.byState['China'];
  populations.byState.CAN = populations.byState['Canada'];
  populations.byState.ITA = populations.byState['Italy'];
  populations.byState.AUS = populations.byState['Australia'];

  // Store data from features
  for (let feature of featureCollection.features) {
    if (feature.properties.pop_est) {
      populations.byCountry[feature.properties.name] = feature.properties.pop_est;
      if (feature.properties.name_en) {
        populations.byCountry[feature.properties.name_en] = feature.properties.pop_est;
      }
      if (feature.properties.abbrev) {
        populations.byCountry[feature.properties.abbrev.replace(/\./g, '')] = feature.properties.pop_est;
      }
    }
  }

  return populations;
}

const generatePopulations = async ({ locations, featureCollection, report, options }) => {
  console.log('⏳ Getting population data...');

  let populations = await readPopulationData(featureCollection);

  function getPopulation(location) {
    let population = null;

    if (location.city) {
      // Use either city by country or city by state
      let populationSource = populations.byCity[location.country];
      if (populationSource && populationSource[location.state]) {
        populationSource = populationSource[location.state];
      }
      if (populationSource && populationSource[location.state]) {
        population = populationSource[location.city];
      }
    } else if (location.county) {
      if (populations.byCounty[location.country]) {
        // Try counties
        let populationSource = populations.byCounty[location.country];
        let countyNameReplaced = location.county.replace('Parish', 'County');
        let countyNameJoined = location.county + ', ' + location.state;
        let countyNameReplacedJoined = countyNameReplaced + ', ' + location.state;

        population = populationSource[location.county] || populationSource[countyNameReplaced] || populationSource[countyNameJoined] || populationSource[countyNameReplacedJoined];
      }
    } else if (location.state) {
      if (populations.byState[location.country] && populations.byState[location.country][location.state]) {
        // Try states
        population = populations.byState[location.country][location.state];
      }
    } else {
      // Try countries
      population = populations.byCountry[location.country];
    }

    if (!population) {
      population = populations.supplemental[location.city];
    }

    if (!population) {
      population = populations.supplemental[location.county];
    }

    if (!population) {
      population = populations.supplemental[location.state];
    }

    if (!population) {
      population = populations.supplemental[location.country];
    }

    if (!population) {
      if (location.featureId) {
        let feature = featureCollection.features[location.featureId];
        if (feature.properties.pop_est) {
          population = feature.properties.pop_est;
        }
      }
    }

    return population;
  }

  const errors = [];

  let populationFound = 0;
  for (let location of locations) {
    let population = getPopulation(location);

    if (population) {
      location.population = population;
      populationFound++;
    } else {
      console.error('  ❌ %s: ?', transform.getName(location));
      errors.push(transform.getName(location));
    }
  }
  console.log('✅ Found population data for %d out of %d locations', populationFound, Object.keys(locations).length);

  report['findPopulation'] = {
    numLocationsWithPopulation: populationFound,
    missingPopulations: errors
  };

  return { locations, featureCollection, report, options };
};

export default generatePopulations;
