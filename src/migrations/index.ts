import * as migration_20261120_080126_initial from './20261120_080126_initial'
import * as migration_20261120_090000_search_index from './20261120_090000_search_index'

export const migrations = [
  {
    up: migration_20261120_080126_initial.up,
    down: migration_20261120_080126_initial.down,
    name: '20261120_080126_initial',
  },
  {
    up: migration_20261120_090000_search_index.up,
    down: migration_20261120_090000_search_index.down,
    name: '20261120_090000_search_index',
  },
]
