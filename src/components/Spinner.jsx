import Loader from './Loader'

/**
 * The app's loading indicator. The mark itself lives in Loader; this stays as a
 * thin wrapper so all twelve existing call sites keep working untouched, at the
 * same size and row layout as before — including the ones inside buttons.
 */
export default function Spinner({ label = 'טוען…', className = '' }) {
  return <Loader label={label} size="md" className={className} />
}
