import { clubMessages } from '../i18n/club-pt-br';
import styles from './club-page.module.css';
import { HeadlineText } from './headline';

const { demonstration } = clubMessages;
const bookingVideoId = 'wTnxs8DEBWE';

export function ClubBookingVideo({ id }: { id: string }) {
  const titleId = `${id}-titulo`;
  return (
    <section
      id={id}
      className={`lx-section ${styles['lx-club-section']}`}
      data-surface="wash"
      aria-labelledby={titleId}
    >
      <div className="lx-container">
        <div className="lx-section-head lx-section-head--center">
          <h2 id={titleId} className="lx-headline">
            <HeadlineText headline={demonstration.title} />
          </h2>
          <p className="lx-body">{demonstration.description}</p>
        </div>
        <figure className={`lx-stack ${styles['lx-club-booking-media']}`}>
          <iframe
            className={styles['lx-club-booking-video']}
            data-surface="deep"
            src={`https://www.youtube-nocookie.com/embed/${bookingVideoId}?playsinline=1`}
            title={demonstration.playerTitle}
            loading="lazy"
            allow="encrypted-media; picture-in-picture"
            allowFullScreen
          />
          <figcaption>
            <a
              className="lx-link"
              href={`https://youtu.be/${bookingVideoId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {demonstration.watchOnYouTube}
            </a>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
