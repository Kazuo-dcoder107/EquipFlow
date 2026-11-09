import { initial } from '../utils/format'

// A round picture with the first letter of the name. (Profile photos can be shown here later.)
export default function Avatar({ name, size = 'md' }) {
  return (
    <span className={`avatar-circle avatar-${size}`} aria-hidden="true">
      {initial(name)}
    </span>
  )
}
